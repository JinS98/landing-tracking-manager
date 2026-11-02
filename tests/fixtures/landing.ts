import { TrackingSdk, createGoogleAdsAdapter, type TrackingDiagnostic } from '../../packages/tracking-sdk/src/index.ts';

type TestWindow = Window & {
  landing?: {
    ready: Promise<void>;
    signals: TrackingDiagnostic[];
    legacy: { pageviews: number; inquiries: number; mediaConversions: number };
    sdk: TrackingSdk;
    consent: (value: boolean) => Promise<void>;
  };
};

const host = window as TestWindow;
const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? sessionStorage.getItem('fixture-mode') ?? 'observe';
sessionStorage.setItem('fixture-mode', mode);
const legacy = { pageviews: 1, inquiries: 0, mediaConversions: 0 };
const signals: TrackingDiagnostic[] = [];
let consent = params.get('consent') !== 'off';
const sdk = new TrackingSdk({
  siteId: 'integration-demo', configUrl: '/tracking-config',
  adapters: mode === 'owned' || mode === 'both' ? { googleAds: createGoogleAdsAdapter() } : {},
  hasConsent: () => consent,
  onDiagnostic: signal => signals.push(signal),
});
const ready = sdk.start();
host.landing = { ready, signals, legacy, sdk, consent: async value => { consent = value; if (value) await sdk.start(); } };

document.getElementById('success')?.addEventListener('click', () => {
  legacy.inquiries++;
  const token = crypto.randomUUID();
  if (mode === 'observe' || mode === 'both') legacy.mediaConversions++;
  history.pushState({}, '', `/complete?token=${encodeURIComponent(token)}`);
});
document.getElementById('failure')?.addEventListener('click', () => {
  // Failed requests never create a completion token or media conversion.
});
