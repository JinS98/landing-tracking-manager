export type Provider = 'gtm' | 'googleAds' | 'naverWcs' | 'karrot' | 'meta' | 'tiktok';
export type Site = { id: string; companyName: string; domain: string; status: 'active' | 'pending'; sdkStatus: 'installed' | 'not_installed' };
export type CommonScript = { id: string; provider: Provider; enabled: boolean; trackingId: string; inflowDomain?: string };
export type ConversionScript = { id: string; provider: Provider; enabled: boolean; event: 'consultation_complete'; sendTo?: string; conversionType?: string; eventName?: string };
export type TrackingConfig = { siteId: string; version: number; common: CommonScript[]; conversions: ConversionScript[] };
