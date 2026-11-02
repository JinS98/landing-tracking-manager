import { isValidSiteId, parsePublishedConfig, type CommonTag, type ConversionTag, type Provider, type PublishedConfig } from '@ltm/tracking-core';
export { createGtmAdapter, createGoogleAdsAdapter, type GoogleAdapterEnvironment } from './adapters/google.ts';
export { createNaverWcsAdapter, type NaverAdapterEnvironment } from './adapters/naver.ts';
export { createKarrotAdapter, createMetaAdapter, createTikTokAdapter, type SocialAdapterEnvironment } from './adapters/social.ts';

export type ProviderAdapter = {
  load(tag: CommonTag): Promise<void> | void;
  convert(tag: ConversionTag): Promise<void> | void;
};
export type TrackingDiagnostic = {
  kind: 'config_loaded' | 'adapter_loaded' | 'adapter_failed' | 'consent_blocked' | 'ready' | 'init_failed';
  siteId: string;
  releaseVersion?: number;
  provider?: Provider;
};
export type TrackingSdkOptions = {
  siteId: string;
  configUrl: string;
  adapters: Partial<Record<Provider, ProviderAdapter>>;
  hasConsent: () => boolean;
  /** Optional extra validation for completion tokens. Return null to suppress conversion. */
  verifyCompletionToken?: (token: string) => Promise<{ eventId: string } | null>;
  onError?: (error: Error) => void;
  /** Local signal only. A host application must explicitly send approved telemetry. */
  onDiagnostic?: (signal: TrackingDiagnostic) => void;
  timeoutMs?: number;
};

const seenConversions = new WeakMap<Window, Set<string>>();
const globalKey = '__ltmLoadedTags';
const owners = new WeakMap<Window, Map<string, TrackingSdk>>();

class InvalidConfigError extends Error {}

function errorFrom(value: unknown): Error {
  return value instanceof Error ? value : new Error('Tracking SDK initialization failed');
}
const digest = (value: string) => {
  let hash = 2166136261;
  for (const char of value) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0).toString(36);
};

/** Browser runtime. Provider adapters are opt-in so each site's existing tags can be reconciled first. */
export class TrackingSdk {
  private config: PublishedConfig | null = null;
  private started: Promise<void> | null = null;
  private restoreRoutes: (() => void) | null = null;
  private delegate: TrackingSdk | null = null;
  private destroyed = false;
  private readonly loadedProviders = new Set<Provider>();
  private readonly options: TrackingSdkOptions;
  constructor(options: TrackingSdkOptions) { this.options = options; }

  start(): Promise<void> {
    if (this.destroyed) return Promise.resolve();
    if (!isValidSiteId(this.options.siteId)) {
      this.reportError(new Error('Invalid siteId'));
      return Promise.resolve();
    }
    const siteOwners = owners.get(window) ?? new Map<string, TrackingSdk>();
    owners.set(window, siteOwners);
    const existing = siteOwners.get(this.options.siteId);
    if (existing && existing !== this) {
      this.delegate = existing;
      return existing.start();
    }
    this.delegate = null;
    siteOwners.set(this.options.siteId, this);
    this.started ??= this.initialize();
    return this.started;
  }

  private async initialize(): Promise<void> {
    let initialized = false;
    try {
      this.config = null;
      this.loadedProviders.clear();
      this.config = await this.fetchConfig();
      this.emitDiagnostic('config_loaded');
      if (this.destroyed || !this.hasConsent()) { this.emitDiagnostic('consent_blocked'); return; }
      const registry = this.registry();
      for (const tag of this.config.common.filter(item => item.enabled)) {
        if (this.destroyed || !this.hasConsent()) return;
        const key = this.options.siteId + ':' + tag.provider + ':' + tag.trackingId;
        const adapter = this.options.adapters[tag.provider];
        if (!adapter) continue;
        if (registry.has(key)) { this.loadedProviders.add(tag.provider); continue; }
        try { await adapter.load(tag); registry.add(key); this.loadedProviders.add(tag.provider); this.emitDiagnostic('adapter_loaded', tag.provider); }
        catch (error) { this.emitDiagnostic('adapter_failed', tag.provider); this.reportError(errorFrom(error)); }
      }
      if (this.destroyed) return;
      this.observeRoutes();
      initialized = true;
      this.emitDiagnostic('ready');
      void this.checkCompleteRoute();
    } catch (error) { this.emitDiagnostic('init_failed'); this.reportError(errorFrom(error)); }
    finally {
      if (!initialized) {
        this.started = null;
        const siteOwners = owners.get(window);
        if (siteOwners?.get(this.options.siteId) === this) siteOwners.delete(this.options.siteId);
      }
    }
  }

  private async fetchConfig(): Promise<PublishedConfig> {
    const url = new URL(this.options.configUrl, window.location.href);
    url.searchParams.set('siteId', this.options.siteId);
    const timeoutMs = Number.isFinite(this.options.timeoutMs) && (this.options.timeoutMs ?? 0) > 0
      ? Math.min(this.options.timeoutMs!, 10_000) : 2500;
    let lastError: Error = new Error('Published config unavailable');
    for (let attempt = 0; attempt < 2; attempt++) {
      const controller = new AbortController();
      let timer: number | undefined;
      const timeout = new Promise<never>((_, reject) => {
        timer = window.setTimeout(() => {
          controller.abort();
          reject(new Error('Published config timed out'));
        }, timeoutMs);
      });
      try {
        return await Promise.race([timeout, (async () => {
          const response = await fetch(url, { signal: controller.signal, credentials: 'omit', cache: 'no-cache' });
          if (!response.ok) {
            const message = 'Config HTTP ' + response.status;
            if (response.status >= 500) throw new Error(message);
            throw new InvalidConfigError(message);
          }
          try { return parsePublishedConfig(await response.json(), this.options.siteId); }
          catch { throw new InvalidConfigError('Invalid published config'); }
        })()]);
      } catch (error) {
        lastError = errorFrom(error);
        if (error instanceof InvalidConfigError) break;
      }
      finally { window.clearTimeout(timer); }
    }
    throw lastError;
  }

  private reportError(error: Error): void {
    try { this.options.onError?.(error); } catch { /* diagnostics must not block the page */ }
  }

  private emitDiagnostic(kind: TrackingDiagnostic['kind'], provider?: Provider): void {
    try { this.options.onDiagnostic?.({ kind, siteId: this.options.siteId,
      ...(this.config ? { releaseVersion: this.config.releaseVersion } : {}), ...(provider ? { provider } : {}) }); }
    catch { /* diagnostics must not block the page */ }
  }

  private hasConsent(): boolean {
    try { return this.options.hasConsent(); }
    catch (error) { this.reportError(errorFrom(error)); return false; }
  }

  private registry(): Set<string> {
    const shared = window as unknown as Record<string, Set<string>>;
    shared[globalKey] ??= new Set<string>();
    return shared[globalKey];
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

  private completionToken(): string | null {
    if (window.location.pathname !== '/complete' && window.location.pathname !== '/complete/') return null;
    const tokens = new URLSearchParams(window.location.search).getAll('token');
    return tokens.length === 1 && /^[A-Za-z0-9._~-]{1,256}$/.test(tokens[0]) ? tokens[0] : null;
  }

  private async checkCompleteRoute(): Promise<void> {
    const token = this.completionToken();
    if (!token) return;
    try {
      const verified = this.options.verifyCompletionToken
        ? await this.options.verifyCompletionToken(token) : { eventId: token };
      if (this.destroyed || this.completionToken() !== token) return;
      if (verified && typeof verified.eventId === 'string' && verified.eventId.length > 0 && verified.eventId.length <= 256) {
        await this.track('consultation_complete', { eventId: verified.eventId });
      }
    } catch (error) { this.reportError(errorFrom(error)); }
  }

  async track(event: 'consultation_complete', input: { eventId: string }): Promise<void> {
    if (this.destroyed) return;
    if (this.delegate) return this.delegate.track(event, input);
    if (event !== 'consultation_complete' || !input || typeof input.eventId !== 'string' ||
        !input.eventId || input.eventId.length > 256) return;
    if (this.started) await this.started;
    if (this.destroyed || !this.config || !this.hasConsent()) return;
    const seen = seenConversions.get(window) ?? new Set<string>();
    seenConversions.set(window, seen);
    for (const tag of this.config.conversions.filter(item => item.enabled && item.event === event)) {
      if (!this.loadedProviders.has(tag.provider)) continue;
      const adapter = this.options.adapters[tag.provider];
      if (!adapter) continue;
      const key = 'ltm:' + this.options.siteId + ':' + tag.id + ':' + digest(input.eventId);
      if (seen.has(key)) continue;
      try { if (sessionStorage.getItem(key)) continue; sessionStorage.setItem(key, 'attempted'); } catch { /* memory fallback */ }
      seen.add(key);
      try { await adapter.convert(tag); } catch (error) { this.reportError(errorFrom(error)); }
    }
  }

  destroy(): void {
    this.destroyed = true;
    this.restoreRoutes?.();
    this.restoreRoutes = null;
    if (!this.delegate) {
      const siteOwners = owners.get(window);
      if (siteOwners?.get(this.options.siteId) === this) siteOwners.delete(this.options.siteId);
    }
  }
}
