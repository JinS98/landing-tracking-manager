import type { CommonTag, ConversionTag } from '@ltm/tracking-core';
import type { ProviderAdapter } from '../index.ts';

type Wcs = { inflow(domain: string): void; trans(event: { type: string }): void };
type NaverWindow = Window & {
  wcs?: Wcs;
  wcs_add?: { wa?: string };
  wcs_do?: () => void;
  _nasa?: { cnv?: unknown };
};
export type NaverAdapterEnvironment = { window: NaverWindow; document: Document };

const scriptUrl = 'https://wcs.naver.net/wcslog.js';
const states = new WeakMap<NaverWindow, { trackingId: string; domain: string; ready: Promise<void> }>();

function environment(override?: NaverAdapterEnvironment): NaverAdapterEnvironment {
  return override ?? { window: window as NaverWindow, document };
}

function matchesHost(hostname: string, domain: string): boolean {
  return hostname === domain || hostname.endsWith('.' + domain);
}

function existingScript(doc: Document): HTMLScriptElement | undefined {
  return Array.from(doc.querySelectorAll('script[src]')).find(script => {
    try {
      const url = new URL((script as HTMLScriptElement).src, doc.baseURI || 'https://localhost/');
      return url.protocol === 'https:' && url.hostname === 'wcs.naver.net' && url.pathname === '/wcslog.js';
    } catch { return false; }
  }) as HTMLScriptElement | undefined;
}

function requireWcs(win: NaverWindow): Wcs {
  if (typeof win.wcs?.inflow !== 'function' || typeof win.wcs.trans !== 'function' || typeof win.wcs_do !== 'function') {
    throw new Error('Naver WCS trans 스크립트가 준비되지 않았습니다.');
  }
  return win.wcs;
}

function loadScript(win: NaverWindow, doc: Document): Promise<void> {
  if (win.wcs && win.wcs_do) { requireWcs(win); return Promise.resolve(); }
  let script = existingScript(doc);
  if (!script) {
    script = doc.createElement('script');
    script.async = true;
    script.src = scriptUrl;
  }
  const pending = new Promise<void>((resolve, reject) => {
    const timeout = win.setTimeout(() => reject(new Error('Naver WCS 스크립트 로드 시간이 초과되었습니다.')), 5000);
    script.addEventListener('load', () => {
      win.clearTimeout(timeout);
      try { requireWcs(win); resolve(); } catch (error) { reject(error); }
    }, { once: true });
    script.addEventListener('error', () => {
      win.clearTimeout(timeout);
      reject(new Error('Naver WCS 스크립트를 불러오지 못했습니다.'));
    }, { once: true });
  });
  if (!script.isConnected) (doc.head ?? doc.documentElement).appendChild(script);
  return pending;
}

/** Opt-in adapter for Naver's wcs.trans script. Audit legacy wcs.cnv tags before enabling it. */
export function createNaverWcsAdapter(override?: NaverAdapterEnvironment): ProviderAdapter {
  return {
    load(tag: CommonTag) {
      if (tag.provider !== 'naverWcs' || !/^[A-Za-z0-9_-]{1,100}$/.test(tag.trackingId) ||
          !tag.inflowDomain || tag.inflowDomain.length > 253 || !/\.[a-z]{2,}$/.test(tag.inflowDomain) ||
          !tag.inflowDomain.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))) {
        throw new Error('Naver WCS 공통 설정이 올바르지 않습니다.');
      }
      const { window: win, document: doc } = environment(override);
      if (!matchesHost(win.location.hostname, tag.inflowDomain)) throw new Error('Naver WCS 유입 도메인이 현재 호스트와 다릅니다.');
      const prior = states.get(win);
      if (prior) {
        if (prior.trackingId !== tag.trackingId || prior.domain !== tag.inflowDomain) throw new Error('Naver WCS 설정이 이미 다른 값으로 초기화되었습니다.');
        return prior.ready;
      }
      if (win.wcs_add !== undefined && (typeof win.wcs_add !== 'object' || win.wcs_add === null)) throw new Error('기존 wcs_add 값이 올바르지 않습니다.');
      if (win.wcs_add?.wa && win.wcs_add.wa !== tag.trackingId) throw new Error('기존 Naver WA ID와 게시 설정이 다릅니다.');
      if (win._nasa?.cnv !== undefined) throw new Error('구형 Naver wcs.cnv 전환 설정이 존재합니다.');
      const ready = loadScript(win, doc).then(() => {
        if (win.wcs_add?.wa && win.wcs_add.wa !== tag.trackingId) throw new Error('기존 Naver WA ID와 게시 설정이 다릅니다.');
        if (win._nasa?.cnv !== undefined) throw new Error('구형 Naver wcs.cnv 전환 설정이 존재합니다.');
        win.wcs_add ??= {};
        win.wcs_add.wa = tag.trackingId;
        requireWcs(win).inflow(tag.inflowDomain!);
        win.wcs_do!();
      });
      states.set(win, { trackingId: tag.trackingId, domain: tag.inflowDomain, ready });
      void ready.catch(() => { if (states.get(win)?.ready === ready) states.delete(win); });
      return ready;
    },
    async convert(tag: ConversionTag) {
      if (tag.provider !== 'naverWcs' || !tag.conversionType || !/^[A-Za-z0-9_-]{1,100}$/.test(tag.conversionType) || tag.conversionType === 'purchase') {
        throw new Error('Naver WCS 전환 유형이 올바르지 않습니다.');
      }
      const { window: win } = environment(override);
      const state = states.get(win);
      if (!state) throw new Error('Naver WCS 공통 설정이 초기화되지 않았습니다.');
      await state.ready;
      if (!matchesHost(win.location.hostname, state.domain)) throw new Error('Naver WCS 유입 도메인이 현재 호스트와 다릅니다.');
      if (win._nasa?.cnv !== undefined) throw new Error('구형 Naver wcs.cnv 전환 설정이 존재합니다.');
      if (win.wcs_add?.wa !== state.trackingId) throw new Error('Naver WA ID가 변경되었습니다.');
      requireWcs(win).trans({ type: tag.conversionType });
    },
  };
}
