import type { CommonTag, ConversionTag } from '@ltm/tracking-core';
import type { ProviderAdapter } from '../index.ts';

type TagWindow = Window & { dataLayer?: unknown; gtag?: unknown };
export type GoogleAdapterEnvironment = { window: TagWindow; document: Document };

function environment(override?: GoogleAdapterEnvironment): GoogleAdapterEnvironment {
  return override ?? { window: window as TagWindow, document };
}

function dataLayer(win: TagWindow): unknown[] {
  if (win.dataLayer === undefined) win.dataLayer = [];
  if (!Array.isArray(win.dataLayer)) throw new Error('기존 dataLayer가 배열이 아닙니다.');
  return win.dataLayer;
}

function hasScript(doc: Document, path: string, id?: string): boolean {
  return Array.from(doc.querySelectorAll('script[src]')).some(script => {
    try {
      const url = new URL((script as HTMLScriptElement).src, doc.baseURI || 'https://localhost/');
      return url.protocol === 'https:' && url.hostname === 'www.googletagmanager.com' &&
        url.pathname === path && (id === undefined || url.searchParams.get('id') === id);
    } catch { return false; }
  });
}

function appendScript(doc: Document, path: string, id: string): void {
  const script = doc.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com${path}?id=${encodeURIComponent(id)}`;
  (doc.head ?? doc.documentElement).appendChild(script);
}

/** Direct GTM container adapter. The container must own any tags triggered by eventName. */
export function createGtmAdapter(override?: GoogleAdapterEnvironment): ProviderAdapter {
  return {
    load(tag: CommonTag) {
      if (tag.provider !== 'gtm' || !/^GTM-[A-Z0-9]+$/.test(tag.trackingId)) throw new Error('유효한 GTM 공통 설정이 필요합니다.');
      const { window: win, document: doc } = environment(override);
      if (hasScript(doc, '/gtm.js', tag.trackingId)) return;
      const layer = dataLayer(win);
      layer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
      appendScript(doc, '/gtm.js', tag.trackingId);
    },
    convert(tag: ConversionTag) {
      if (tag.provider !== 'gtm' || !tag.eventName || !/^[A-Za-z0-9_-]{1,100}$/.test(tag.eventName)) throw new Error('유효한 GTM 전환 이벤트명이 필요합니다.');
      const { window: win } = environment(override);
      if (!Array.isArray(win.dataLayer)) throw new Error('GTM dataLayer가 준비되지 않았습니다.');
      win.dataLayer.push({ event: tag.eventName });
    },
  };
}

/** Direct Google Ads gtag.js adapter. Do not enable for an AW conversion already owned by GTM. */
export function createGoogleAdsAdapter(override?: GoogleAdapterEnvironment): ProviderAdapter {
  return {
    load(tag: CommonTag) {
      if (tag.provider !== 'googleAds' || !/^AW-[0-9]+$/.test(tag.trackingId)) throw new Error('유효한 Google Ads 공통 설정이 필요합니다.');
      const { window: win, document: doc } = environment(override);
      if (hasScript(doc, '/gtag/js', tag.trackingId)) {
        if (typeof win.gtag !== 'function') throw new Error('기존 Google tag에 gtag 함수가 없습니다.');
        return;
      }
      if (hasScript(doc, '/gtag/js')) {
        if (typeof win.gtag !== 'function') throw new Error('기존 Google tag에 gtag 함수가 없습니다.');
        (win.gtag as (...args: unknown[]) => void)('config', tag.trackingId);
        return;
      }
      const hadGtag = typeof win.gtag === 'function';
      if (win.gtag !== undefined && !hadGtag) throw new Error('기존 gtag가 함수가 아닙니다.');
      const layer = dataLayer(win);
      if (!hadGtag) win.gtag = function () { layer.push(arguments); };
      const gtag = win.gtag as (...args: unknown[]) => void;
      if (!hadGtag) gtag('js', new Date());
      gtag('config', tag.trackingId);
      appendScript(doc, '/gtag/js', tag.trackingId);
    },
    convert(tag: ConversionTag) {
      if (tag.provider !== 'googleAds' || !tag.sendTo || !/^AW-[0-9]+\/[A-Za-z0-9_-]+$/.test(tag.sendTo)) throw new Error('유효한 Google Ads send_to가 필요합니다.');
      const { window: win } = environment(override);
      if (typeof win.gtag !== 'function') throw new Error('Google tag가 준비되지 않았습니다.');
      (win.gtag as (...args: unknown[]) => void)('event', 'conversion', { send_to: tag.sendTo });
    },
  };
}
