import type { CommonTag, ConversionTag } from '@ltm/tracking-core';
import type { ProviderAdapter } from '../index.ts';

type KarrotPixel = {
  stub?: boolean;
  queue?: Array<[string, IArguments, number]>;
  init(id: string): void;
  track(event: string): void;
};
type MetaPixel = ((...args: unknown[]) => void) & {
  queue?: unknown[][];
  callMethod?: (...args: unknown[]) => void;
  push?: MetaPixel;
  loaded?: boolean;
  version?: string;
};
type TikTokInstance = unknown[] & { _u?: string; track(event: string): void };
type TikTokPixel = unknown[] & {
  _i?: Record<string, TikTokInstance>;
  _t?: Record<string, number>;
  _o?: Record<string, object>;
  methods?: string[];
  setAndDefer?(target: unknown[], method: string): void;
  load(id: string): void;
  page(): void;
  track(event: string): void;
  instance(id: string): TikTokInstance;
};
type PixelWindow = Window & { karrotPixel?: KarrotPixel; fbq?: MetaPixel; _fbq?: MetaPixel; ttq?: TikTokPixel; TiktokAnalyticsObject?: string };
export type SocialAdapterEnvironment = { window: PixelWindow; document: Document };

const karrotUrl = 'https://karrot-pixel.business.daangn.com/karrot-pixel.js';
const metaUrl = 'https://connect.facebook.net/en_US/fbevents.js';
const tiktokUrl = 'https://analytics.tiktok.com/i18n/pixel/events.js';
const karrotStates = new WeakMap<PixelWindow, string>();
const metaStates = new WeakMap<PixelWindow, string>();
const tiktokStates = new WeakMap<PixelWindow, string>();

function environment(override?: SocialAdapterEnvironment): SocialAdapterEnvironment {
  return override ?? { window: window as PixelWindow, document };
}

function hasScript(doc: Document, url: string): boolean {
  const expected = new URL(url);
  return Array.from(doc.querySelectorAll('script[src]')).some(script => {
    try {
      const actual = new URL((script as HTMLScriptElement).src, doc.baseURI || 'https://localhost/');
      return actual.protocol === 'https:' && actual.hostname === expected.hostname && actual.pathname === expected.pathname;
    } catch { return false; }
  });
}

function appendScript(doc: Document, url: string): void {
  const script = doc.createElement('script');
  script.async = true;
  script.src = url;
  (doc.head ?? doc.documentElement).appendChild(script);
}

function assertId(tag: CommonTag, provider: CommonTag['provider'], pattern: RegExp): void {
  if (tag.provider !== provider || !pattern.test(tag.trackingId)) throw new Error(`${provider} 픽셀 ID가 올바르지 않습니다.`);
}

function assertEvent(tag: ConversionTag, provider: ConversionTag['provider'], event: string): void {
  if (tag.provider !== provider || tag.eventName !== event) throw new Error(`${provider}에서 지원하지 않는 전환 이벤트입니다.`);
}

function assertState(state: string | undefined, id: string, provider: string): void {
  if (state !== id) throw new Error(`${provider} 픽셀이 해당 ID로 초기화되지 않았습니다.`);
}

/** Official Karrot queue stub, scoped to one conversion tracking code per site. */
export function createKarrotAdapter(override?: SocialAdapterEnvironment): ProviderAdapter {
  return {
    load(tag) {
      assertId(tag, 'karrot', /^[A-Za-z0-9_-]{1,100}$/);
      const { window: win, document: doc } = environment(override);
      const state = karrotStates.get(win);
      if (state) { assertState(state, tag.trackingId, 'Karrot'); return; }
      if (win.karrotPixel !== undefined) {
        const pixel = win.karrotPixel;
        if (typeof pixel.init !== 'function' || typeof pixel.track !== 'function' || !Array.isArray(pixel.queue)) {
          throw new Error('기존 Karrot 픽셀의 ID를 확인할 수 없습니다.');
        }
        const ids = pixel.queue.filter(item => item[0] === 'init').map(item => String(item[1][0]));
        if (ids.length !== 1 || ids[0] !== tag.trackingId) throw new Error('기존 Karrot 픽셀 ID가 게시 설정과 다릅니다.');
        karrotStates.set(win, tag.trackingId);
        return;
      }
      if (hasScript(doc, karrotUrl)) throw new Error('기존 Karrot 스크립트의 초기화 상태를 확인할 수 없습니다.');
      const pixel: KarrotPixel = { stub: true, queue: [],
        init(id) { pixel.queue!.push(['init', arguments, Date.now()]); },
        track(event) { pixel.queue!.push(['track', arguments, Date.now()]); },
      };
      win.karrotPixel = pixel;
      appendScript(doc, karrotUrl);
      pixel.init(tag.trackingId);
      pixel.track('ViewPage');
      karrotStates.set(win, tag.trackingId);
    },
    convert(tag) {
      assertEvent(tag, 'karrot', 'SubmitApplication');
      const { window: win } = environment(override);
      if (!karrotStates.has(win) || typeof win.karrotPixel?.track !== 'function') throw new Error('Karrot 픽셀이 준비되지 않았습니다.');
      win.karrotPixel.track('SubmitApplication');
    },
  };
}

/** Meta Pixel loader with pixel-specific events to avoid broadcasting to other pixels. */
export function createMetaAdapter(override?: SocialAdapterEnvironment): ProviderAdapter {
  return {
    load(tag) {
      assertId(tag, 'meta', /^[0-9]{1,30}$/);
      const { window: win, document: doc } = environment(override);
      const state = metaStates.get(win);
      if (state) { assertState(state, tag.trackingId, 'Meta'); return; }
      if (win.fbq !== undefined) {
        if (typeof win.fbq !== 'function' || !Array.isArray(win.fbq.queue)) throw new Error('기존 Meta 픽셀의 ID를 확인할 수 없습니다.');
        const ids = win.fbq.queue.filter(item => item[0] === 'init').map(item => String(item[1]));
        if (ids.length !== 1 || ids[0] !== tag.trackingId) throw new Error('기존 Meta 픽셀 ID가 게시 설정과 다릅니다.');
        metaStates.set(win, tag.trackingId);
        return;
      }
      if (hasScript(doc, metaUrl)) throw new Error('기존 Meta 스크립트의 초기화 상태를 확인할 수 없습니다.');
      const fbq = function (...args: unknown[]) {
        if (fbq.callMethod) fbq.callMethod(...args);
        else fbq.queue!.push(args);
      } as MetaPixel;
      fbq.queue = [];
      fbq.push = fbq;
      fbq.loaded = true;
      fbq.version = '2.0';
      win.fbq = fbq;
      win._fbq ??= fbq;
      appendScript(doc, metaUrl);
      fbq('init', tag.trackingId);
      fbq('trackSingle', tag.trackingId, 'PageView');
      metaStates.set(win, tag.trackingId);
    },
    convert(tag) {
      assertEvent(tag, 'meta', 'Lead');
      const { window: win } = environment(override);
      const id = metaStates.get(win);
      if (!id || typeof win.fbq !== 'function') throw new Error('Meta 픽셀이 준비되지 않았습니다.');
      win.fbq('trackSingle', id, 'Lead');
    },
  };
}

/** TikTok's deferred API with events targeted at the configured pixel instance. */
export function createTikTokAdapter(override?: SocialAdapterEnvironment): ProviderAdapter {
  return {
    load(tag) {
      assertId(tag, 'tiktok', /^[A-Za-z0-9]{1,100}$/);
      const { window: win, document: doc } = environment(override);
      const state = tiktokStates.get(win);
      if (state) { assertState(state, tag.trackingId, 'TikTok'); return; }
      if (win.ttq !== undefined) {
        const pixel = win.ttq;
        if (typeof pixel.instance !== 'function' || typeof pixel.track !== 'function' || !pixel._i || !pixel._i[tag.trackingId]) {
          throw new Error('기존 TikTok 픽셀의 ID를 확인할 수 없습니다.');
        }
        tiktokStates.set(win, tag.trackingId);
        return;
      }
      if (hasScript(doc, tiktokUrl)) throw new Error('기존 TikTok 스크립트의 초기화 상태를 확인할 수 없습니다.');
      const pixel = [] as unknown as TikTokPixel;
      pixel.methods = ['page', 'track', 'identify', 'instances', 'debug', 'on', 'off', 'once', 'ready', 'alias', 'group', 'enableCookie', 'disableCookie'];
      pixel.setAndDefer = (target, method) => {
        (target as unknown as Record<string, unknown>)[method] = (...args: unknown[]) => { target.push([method, ...args]); };
      };
      for (const method of pixel.methods) pixel.setAndDefer(pixel, method);
      pixel.instance = id => {
        const instance = pixel._i?.[id] ?? [] as unknown as TikTokInstance;
        for (const method of pixel.methods!) pixel.setAndDefer!(instance, method);
        return instance;
      };
      pixel.load = id => {
        pixel._i ??= {};
        const instance = [] as unknown as TikTokInstance;
        instance._u = tiktokUrl;
        pixel._i[id] = instance;
        pixel._t ??= {};
        pixel._t[id] = Date.now();
        pixel._o ??= {};
        pixel._o[id] = {};
        appendScript(doc, `${tiktokUrl}?sdkid=${encodeURIComponent(id)}&lib=ttq`);
      };
      win.TiktokAnalyticsObject = 'ttq';
      win.ttq = pixel;
      pixel.load(tag.trackingId);
      pixel.page();
      tiktokStates.set(win, tag.trackingId);
    },
    convert(tag) {
      assertEvent(tag, 'tiktok', 'SubmitForm');
      const { window: win } = environment(override);
      const id = tiktokStates.get(win);
      if (!id || typeof win.ttq?.instance !== 'function' || !win.ttq._i?.[id]) throw new Error('TikTok 픽셀이 준비되지 않았습니다.');
      win.ttq.instance(id).track('SubmitForm');
    },
  };
}
