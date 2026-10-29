import { parsePublishedConfig, type CommonTag, type ConversionTag, type Provider, type PublishedConfig } from '@ltm/tracking-core';

export type ProviderAdapter = {
  load(tag: CommonTag): Promise<void> | void;
  convert(tag: ConversionTag): Promise<void> | void;
};
export type TrackingSdkOptions = {
  siteId: string;
  configUrl: string;
  adapters: Partial<Record<Provider, ProviderAdapter>>;
  hasConsent: () => boolean;
  onError?: (error: Error) => void;
  timeoutMs?: number;
};

const seenConversions = new Set<string>();
const globalKey = '__ltmLoadedTags';
const digest = (value: string) => {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
};

/** Browser runtime only. No built-in provider scripts are shipped until tested adapters are approved. */
export class TrackingSdk {
  private config: PublishedConfig | null = null;
  private started: Promise<void> | null = null;
  private restoreRoutes: (() => void) | null = null;
  constructor(private readonly options: TrackingSdkOptions) {}

  start(): Promise<void> {
    this.started ??= this.initialize();
    return this.started;
  }

  private async initialize(): Promise<void> {
    try {
      this.config = await this.fetchConfig();
      if (!this.options.hasConsent()) return;
      const registry = this.registry();
      for (const tag of this.config.common.filter(item => item.enabled)) {
        const key = this.options.siteId + ':' + tag.provider + ':' + tag.trackingId;
        if (registry.has(key) || this.hasExistingScript(tag)) continue;
        const adapter = this.options.adapters[tag.provider];
        if (!adapter) continue;
        try { await adapter.load(tag); registry.add(key); }
        catch (error) { this.options.onError?.(error as Error); }
      }
      this.observeRoutes();
      void this.checkCompleteRoute();
    } catch (error) { this.options.onError?.(error as Error); }
  }

  private async fetchConfig(): Promise<PublishedConfig> {
    const url = new URL(this.options.configUrl, window.location.href);
    url.searchParams.set('siteId', this.options.siteId);
    let lastError: Error = new Error('Published config unavailable');
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      const timer = window.setTimeout(() => controller.abort(), this.options.timeoutMs ?? 2500);
      try {
        const response = await fetch(url, { signal: controller.signal, credentials: 'omit' });
        if (!response.ok) throw new Error('Config HTTP ' + response.status);
        return parsePublishedConfig(await response.json(), this.options.siteId);
      } catch (error) { lastError = error as Error; }
      finally { window.clearTimeout(timer); }
    }
    throw lastError;
  }

  private registry(): Set<string> {
    const shared = window as unknown as Record<string, Set<string>>;
    shared[globalKey] ??= new Set<string>();
    return shared[globalKey];
  }

  private hasExistingScript(tag: CommonTag): boolean {
    return Array.from(document.querySelectorAll('script')).some(script =>
      script.dataset.ltmTrackingId === tag.trackingId || Boolean(script.src && script.src.includes(encodeURIComponent(tag.trackingId))));
  }

  private observeRoutes(): void {
    if (this.restoreRoutes) return;
    const push = history.pushState;
    const replace = history.replaceState;
    const check = () => { void this.checkCompleteRoute(); };
    history.pushState = function (...args) { const result = push.apply(this, args); check(); return result; };
    history.replaceState = function (...args) { const result = replace.apply(this, args); check(); return result; };
    window.addEventListener('popstate', check);
    this.restoreRoutes = () => { history.pushState = push; history.replaceState = replace; window.removeEventListener('popstate', check); };
  }

  private async checkCompleteRoute(): Promise<void> {
    if (!/\/complete\/?$/.test(window.location.pathname)) return;
    const token = new URLSearchParams(window.location.search).get('token');
    if (token) await this.track('consultation_complete', { eventId: token });
  }

  async track(event: 'consultation_complete', input: { eventId: string }): Promise<void> {
    if (!this.config || !this.options.hasConsent() || !input.eventId) return;
    for (const tag of this.config.conversions.filter(item => item.enabled && item.event === event)) {
      if (!this.config.common.some(item => item.provider === tag.provider && item.enabled)) continue;
      const adapter = this.options.adapters[tag.provider];
      if (!adapter) continue;
      const key = 'ltm:' + this.options.siteId + ':' + this.config.releaseVersion + ':' + tag.id + ':' + digest(input.eventId);
      if (seenConversions.has(key)) continue;
      try { if (sessionStorage.getItem(key)) continue; sessionStorage.setItem(key, 'attempted'); } catch { /* memory fallback */ }
      seenConversions.add(key);
      try { await adapter.convert(tag); } catch (error) { this.options.onError?.(error as Error); }
    }
  }

  destroy(): void { this.restoreRoutes?.(); this.restoreRoutes = null; }
}
