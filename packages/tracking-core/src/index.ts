export const providerNames = ['gtm', 'googleAds', 'naverWcs', 'karrot', 'meta', 'tiktok'] as const;
export type Provider = typeof providerNames[number];
export type CommonTag = { id: string; provider: Provider; enabled: boolean; trackingId: string; inflowDomain?: string };
export type ConversionTag = { id: string; provider: Provider; enabled: boolean; event: 'consultation_complete'; sendTo?: string; conversionType?: string; eventName?: string };
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
const safeEvent = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
const provider = (value: unknown): value is Provider => providerNames.includes(value as Provider);

/** Accept only the public data fields the SDK understands; never accept remote JavaScript. */
export function parsePublishedConfig(value: unknown, expectedSiteId: string): PublishedConfig {
  if (!record(value) || value.schemaVersion !== 1 || value.siteId !== expectedSiteId ||
      !Number.isSafeInteger(value.releaseVersion) || (value.releaseVersion as number) < 1 ||
      typeof value.publishedAt !== 'string' || !Array.isArray(value.common) || !Array.isArray(value.conversions) ||
      value.common.length > 20 || value.conversions.length > 50) throw new Error('Invalid published config');
  const common: CommonTag[] = value.common.map((item: unknown) => {
    if (!record(item) || !safeId(item.id) || !provider(item.provider) || typeof item.enabled !== 'boolean' || !safeId(item.trackingId)) throw new Error('Invalid common tag');
    if (item.provider === 'gtm' && !/^GTM-[A-Z0-9]+$/.test(item.trackingId)) throw new Error('Invalid GTM ID');
    if (item.provider === 'googleAds' && !/^AW-[0-9]+$/.test(item.trackingId)) throw new Error('Invalid Google Ads ID');
    const inflowDomain = item.inflowDomain;
    if (item.provider === 'naverWcs' && (typeof inflowDomain !== 'string' || !/^[a-z0-9.-]+\.[a-z]{2,}$/.test(inflowDomain))) throw new Error('Invalid inflow domain');
    return { id: item.id, provider: item.provider, enabled: item.enabled, trackingId: item.trackingId,
      ...(item.provider === 'naverWcs' ? { inflowDomain: inflowDomain as string } : {}) };
  });
  const conversions: ConversionTag[] = value.conversions.map((item: unknown) => {
    if (!record(item) || !safeId(item.id) || !provider(item.provider) || typeof item.enabled !== 'boolean' || item.event !== 'consultation_complete') throw new Error('Invalid conversion tag');
    if (item.provider === 'googleAds' && (typeof item.sendTo !== 'string' || !/^AW-[0-9]+\/[A-Za-z0-9_-]+$/.test(item.sendTo))) throw new Error('Invalid send_to');
    if (item.provider === 'naverWcs' && !safeEvent(item.conversionType)) throw new Error('Invalid conversion type');
    if (!['googleAds', 'naverWcs'].includes(item.provider) && !safeEvent(item.eventName)) throw new Error('Invalid event name');
    return { id: item.id, provider: item.provider, enabled: item.enabled, event: 'consultation_complete',
      ...(item.provider === 'googleAds' ? { sendTo: item.sendTo as string } : item.provider === 'naverWcs' ? { conversionType: item.conversionType as string } : { eventName: item.eventName as string }) };
  });
  return { schemaVersion: 1, siteId: expectedSiteId, releaseVersion: value.releaseVersion as number,
    publishedAt: value.publishedAt, common, conversions };
}
