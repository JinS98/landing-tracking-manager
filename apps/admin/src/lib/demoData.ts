import type { DemoWorkspace, Provider } from '../types/tracking';

export const providerLabels: Record<Provider, string> = {
  gtm: 'Google Tag Manager', googleAds: 'Google Ads', naverWcs: 'Naver WCS',
  karrot: '당근 Pixel', meta: 'Meta Pixel', tiktok: 'TikTok Pixel',
};

// All names, domains and IDs below are fictional portfolio data.
export const initialWorkspace: DemoWorkspace = {
  companies: [
    { id: 'sample-coffee', name: '샘플 커피', status: 'active' },
    { id: 'sample-studio', name: '가상 스튜디오', status: 'pending' },
  ],
  sites: [
    { id: 'coffee-main', companyId: 'sample-coffee', domain: 'coffee.example', environment: 'demo', status: 'active', sdkStatus: 'unknown' },
    { id: 'coffee-event', companyId: 'sample-coffee', domain: 'event.coffee.example', environment: 'demo', status: 'pending', sdkStatus: 'not_installed' },
    { id: 'studio-main', companyId: 'sample-studio', domain: 'studio.example', environment: 'demo', status: 'pending', sdkStatus: 'not_installed' },
  ],
  drafts: [{
    siteId: 'coffee-main', version: 0,
    common: [
      { id: 'demo-gtm', provider: 'gtm', enabled: true, trackingId: 'GTM-DEMO123' },
      { id: 'demo-ads', provider: 'googleAds', enabled: true, trackingId: 'AW-123456789' },
    ],
    conversions: [{ id: 'demo-lead', provider: 'googleAds', enabled: true, event: 'consultation_complete', sendTo: 'AW-123456789/DEMO_LABEL' }],
  }],
  releases: [],
  audit: [],
  importJobs: [],
};
