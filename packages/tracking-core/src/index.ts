export const providerNames = ['gtm', 'googleAds', 'naverWcs', 'karrot', 'meta', 'tiktok'] as const;
export type Provider = typeof providerNames[number];
export type CommonTag = { id: string; provider: Provider; enabled: boolean; trackingId: string; inflowDomain?: string };
export type ConversionTag = { id: string; provider: Provider; enabled: boolean; event: 'consultation_complete'; sendTo?: string; conversionType?: string; eventName?: string };
export type DraftConfig = { siteId: string; version: number; common: CommonTag[]; conversions: ConversionTag[] };
export { diffScriptChanges, type ScriptChange } from './scriptChanges.ts';
export type PublishedConfig = {
  schemaVersion: 1;
  siteId: string;
  releaseVersion: number;
  publishedAt: string;
  common: CommonTag[];
  conversions: ConversionTag[];
};

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const safeId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
export const isValidSiteId = (value: unknown): value is string => typeof value === 'string' && /^[a-z0-9][a-z0-9-]{1,62}$/.test(value);
const safeDomain = (value: unknown): value is string => typeof value === 'string' && value.length <= 253 && /\.[a-z]{2,}$/.test(value) &&
  value.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
const provider = (value: unknown): value is Provider => providerNames.includes(value as Provider);
const hasOnly = (value: Record<string, unknown>, keys: readonly string[]): boolean => Object.keys(value).every(key => keys.includes(key));

function parseTags(commonInput: unknown, conversionInput: unknown): { common: CommonTag[]; conversions: ConversionTag[] } {
  if (!Array.isArray(commonInput) || !Array.isArray(conversionInput) || commonInput.length > 20 || conversionInput.length > 50) {
    throw new Error('공통 설정 또는 전환 이벤트 개수가 올바르지 않습니다.');
  }
  const ids = new Set<string>();
  const providers = new Set<Provider>();
  const common: CommonTag[] = commonInput.map((item: unknown, index: number) => {
    if (!record(item) || !safeId(item.id) || !provider(item.provider) || typeof item.enabled !== 'boolean' || !safeId(item.trackingId)) {
      throw new Error(`공통 설정 ${index + 1}의 필수값이 올바르지 않습니다.`);
    }
    if (!hasOnly(item, item.provider === 'naverWcs' ? ['id', 'provider', 'enabled', 'trackingId', 'inflowDomain'] : ['id', 'provider', 'enabled', 'trackingId'])) {
      throw new Error(`공통 설정 ${index + 1}에 허용되지 않은 필드가 있습니다.`);
    }
    if (ids.has(item.id) || providers.has(item.provider)) throw new Error('공통 설정의 ID 또는 매체가 중복되었습니다.');
    ids.add(item.id); providers.add(item.provider);
    if (item.provider === 'gtm' && !/^GTM-[A-Z0-9]+$/.test(item.trackingId)) throw new Error('GTM ID 형식이 올바르지 않습니다.');
    if (item.provider === 'googleAds' && !/^AW-[0-9]+$/.test(item.trackingId)) throw new Error('Google Ads AW ID 형식이 올바르지 않습니다.');
    if (item.provider === 'naverWcs' && !safeDomain(item.inflowDomain)) throw new Error('Naver 유입 도메인이 올바르지 않습니다.');
    if (item.provider === 'meta' && !/^[0-9]{1,30}$/.test(item.trackingId)) throw new Error('Meta Pixel ID 형식이 올바르지 않습니다.');
    if (item.provider === 'tiktok' && !/^[A-Za-z0-9]{1,100}$/.test(item.trackingId)) throw new Error('TikTok Pixel ID 형식이 올바르지 않습니다.');
    return { id: item.id, provider: item.provider, enabled: item.enabled, trackingId: item.trackingId,
      ...(item.provider === 'naverWcs' ? { inflowDomain: item.inflowDomain as string } : {}) };
  });
  const conversions: ConversionTag[] = conversionInput.map((item: unknown, index: number) => {
    if (!record(item) || !safeId(item.id) || !provider(item.provider) || typeof item.enabled !== 'boolean' || item.event !== 'consultation_complete') {
      throw new Error(`전환 이벤트 ${index + 1}의 필수값이 올바르지 않습니다.`);
    }
    const fields = item.provider === 'googleAds' ? ['sendTo'] : item.provider === 'naverWcs' ? ['conversionType'] : ['eventName'];
    if (!hasOnly(item, ['id', 'provider', 'enabled', 'event', ...fields])) throw new Error(`전환 이벤트 ${index + 1}에 허용되지 않은 필드가 있습니다.`);
    if (ids.has(item.id)) throw new Error('설정 ID가 중복되었습니다.');
    ids.add(item.id);
    if (item.provider === 'googleAds' && (typeof item.sendTo !== 'string' || !/^AW-[0-9]+\/[A-Za-z0-9_-]+$/.test(item.sendTo))) {
      throw new Error('Google Ads send_to 형식이 올바르지 않습니다.');
    }
    if (item.provider === 'naverWcs' && (!safeId(item.conversionType) || item.conversionType === 'purchase')) {
      throw new Error('Naver 전환 유형이 올바르지 않습니다. 구매 전환에는 금액이 필요하며 현재 설정에서 지원하지 않습니다.');
    }
    if (item.provider !== 'googleAds' && item.provider !== 'naverWcs' && !safeId(item.eventName)) throw new Error('전환 이벤트명이 올바르지 않습니다.');
    const supportedEvents: Partial<Record<Provider, string>> = { karrot: 'SubmitApplication', meta: 'Lead', tiktok: 'SubmitForm' };
    if (supportedEvents[item.provider] && item.eventName !== supportedEvents[item.provider]) {
      throw new Error(`${item.provider}의 상담 완료 전환 이벤트명이 올바르지 않습니다.`);
    }
    const matchingCommon = common.find(tag => tag.provider === item.provider);
    if (item.enabled && !matchingCommon?.enabled) throw new Error('활성 전환 이벤트에는 활성 공통 설정이 필요합니다.');
    if (item.provider === 'googleAds' && item.enabled && matchingCommon && (item.sendTo as string).split('/')[0] !== matchingCommon.trackingId) {
      throw new Error('Google Ads send_to의 AW ID가 공통 설정과 다릅니다.');
    }
    return { id: item.id, provider: item.provider, enabled: item.enabled, event: 'consultation_complete',
      ...(item.provider === 'googleAds' ? { sendTo: item.sendTo as string } : item.provider === 'naverWcs' ? { conversionType: item.conversionType as string } : { eventName: item.eventName as string }) };
  });
  return { common, conversions };
}

/** Validate the complete editable draft before storing it. No arbitrary code or extra fields are accepted. */
export function parseDraftConfig(value: unknown, expectedSiteId: string): DraftConfig {
  if (!record(value) || !hasOnly(value, ['siteId', 'version', 'common', 'conversions']) ||
      !isValidSiteId(expectedSiteId) || value.siteId !== expectedSiteId ||
      !Number.isSafeInteger(value.version) || (value.version as number) < 0) throw new Error('초안 설정의 siteId 또는 버전이 올바르지 않습니다.');
  const tags = parseTags(value.common, value.conversions);
  return { siteId: expectedSiteId, version: value.version as number, ...tags };
}

/** Build only the public DTO fields from a validated draft. */
export function projectPublishedConfig(draft: unknown, siteId: string, releaseVersion: number, publishedAt: string): PublishedConfig {
  const validated = parseDraftConfig(draft, siteId);
  if (!Number.isSafeInteger(releaseVersion) || releaseVersion < 1 || !Number.isFinite(Date.parse(publishedAt))) {
    throw new Error('게시 버전 또는 시각이 올바르지 않습니다.');
  }
  return { schemaVersion: 1, siteId, releaseVersion, publishedAt, common: validated.common, conversions: validated.conversions };
}

/** Accept only the public data fields the SDK understands; reject unexpected fields. */
export function parsePublishedConfig(value: unknown, expectedSiteId: string): PublishedConfig {
  if (!record(value) || !hasOnly(value, ['schemaVersion', 'siteId', 'releaseVersion', 'publishedAt', 'common', 'conversions']) ||
      value.schemaVersion !== 1 || !isValidSiteId(expectedSiteId) || value.siteId !== expectedSiteId ||
      !Number.isSafeInteger(value.releaseVersion) || (value.releaseVersion as number) < 1 ||
      typeof value.publishedAt !== 'string' || !Number.isFinite(Date.parse(value.publishedAt))) {
    throw new Error('Invalid published config');
  }
  const tags = parseTags(value.common, value.conversions);
  return { schemaVersion: 1, siteId: expectedSiteId, releaseVersion: value.releaseVersion as number,
    publishedAt: value.publishedAt, ...tags };
}
