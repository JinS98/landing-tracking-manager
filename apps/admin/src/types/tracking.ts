export type Provider = 'gtm' | 'googleAds' | 'naverWcs' | 'karrot' | 'meta' | 'tiktok';

export type Company = { id: string; name: string; status: 'active' | 'pending' };
export type Site = {
  id: string;
  companyId: string;
  domain: string;
  environment: 'demo' | 'staging' | 'production';
  status: 'active' | 'pending';
  sdkStatus: 'installed' | 'not_installed' | 'unknown';
};
export type CommonScript = { id: string; provider: Provider; enabled: boolean; trackingId: string; inflowDomain?: string };
export type ConversionScript = {
  id: string;
  provider: Provider;
  enabled: boolean;
  event: 'consultation_complete';
  sendTo?: string;
  conversionType?: string;
  eventName?: string;
};
export type TrackingConfig = { siteId: string; version: number; common: CommonScript[]; conversions: ConversionScript[] };
export type TrackingRelease = { id: string; siteId: string; version: number; config: TrackingConfig; publishedAt: string; sourceVersion?: number };
export type AuditEntry = { id: string; siteId: string; action: 'draft' | 'publish' | 'rollback' | 'register'; summary: string; at: string };
export type DemoWorkspace = {
  companies: Company[];
  sites: Site[];
  drafts: TrackingConfig[];
  releases: TrackingRelease[];
  audit: AuditEntry[];
};

export const emptyConfig = (siteId: string): TrackingConfig => ({ siteId, version: 0, common: [], conversions: [] });
