import type { Site, TrackingConfig, Provider } from '../types/tracking';
export const providerLabels: Record<Provider,string> = {gtm:'Google Tag Manager',googleAds:'Google Ads',naverWcs:'Naver WCS',karrot:'당근 픽셀',meta:'Meta Pixel',tiktok:'TikTok Pixel'};
export const sites: Site[] = [
  {id:'mikadosushi',companyName:'미카도스시',domain:'mikadosushi-franchise.kr',status:'active',sdkStatus:'not_installed'},
  {id:'demo-cafe',companyName:'데모 카페',domain:'demo-cafe.example',status:'pending',sdkStatus:'not_installed'},
  {id:'demo-brand',companyName:'샘플 브랜드',domain:'brand.example',status:'pending',sdkStatus:'not_installed'}
];
export const initialConfigs: TrackingConfig[] = [
 {siteId:'mikadosushi',version:0,common:[
  {id:'c1',provider:'gtm',enabled:true,trackingId:'GTM-5G2RXVVH'},
  {id:'c2',provider:'googleAds',enabled:true,trackingId:'AW-18439198611'},
  {id:'c3',provider:'naverWcs',enabled:true,trackingId:'s_125a46cb1350',inflowDomain:'mikadosushi-franchise.kr'},
  {id:'c4',provider:'karrot',enabled:true,trackingId:'1793066977218836000'},
  {id:'c5',provider:'meta',enabled:true,trackingId:'1985930952115340'},
  {id:'c6',provider:'tiktok',enabled:true,trackingId:'DALNE6BC77UC8FLKA9GG'}
 ],conversions:[
  {id:'v1',provider:'googleAds',enabled:true,event:'consultation_complete',sendTo:'AW-18439198611/jCVPCPnu7PEcEJOvv9hE'},
  {id:'v2',provider:'naverWcs',enabled:true,event:'consultation_complete',conversionType:'lead'}
 ]}
];
