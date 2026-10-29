import type { DemoWorkspace, Site, TrackingConfig, TrackingRelease } from '../types/tracking';

const stamp = () => new Date().toISOString();
export function saveDraft(state: DemoWorkspace, config: TrackingConfig): DemoWorkspace {
  const current = state.drafts.find(item => item.siteId === config.siteId);
  const next = { ...structuredClone(config), version: (current?.version ?? 0) + 1 };
  return {
    ...state,
    drafts: [...state.drafts.filter(item => item.siteId !== config.siteId), next],
    audit: [{ id: crypto.randomUUID(), siteId: config.siteId, action: 'draft', summary: `초안 v${next.version} 수정`, at: stamp() }, ...state.audit],
  };
}

export function publishDraft(state: DemoWorkspace, siteId: string): DemoWorkspace {
  const draft = state.drafts.find(item => item.siteId === siteId);
  if (!draft) throw new Error('게시할 초안이 없습니다.');
  if (new Set(draft.common.map(item => item.provider)).size !== draft.common.length) throw new Error('같은 매체의 공통 스크립트가 중복됐습니다.');
  if (draft.conversions.some(item => item.enabled && !draft.common.some(common => common.provider === item.provider && common.enabled))) throw new Error('활성 전환 이벤트에는 활성 공통 스크립트가 필요합니다.');
  const version = Math.max(0, ...state.releases.filter(item => item.siteId === siteId).map(item => item.version)) + 1;
  const release: TrackingRelease = { id: crypto.randomUUID(), siteId, version, config: structuredClone(draft), publishedAt: stamp() };
  return {
    ...state, releases: [release, ...state.releases],
    audit: [{ id: crypto.randomUUID(), siteId, action: 'publish', summary: `데모 릴리스 v${version} 게시`, at: release.publishedAt }, ...state.audit],
  };
}

export function rollbackRelease(state: DemoWorkspace, siteId: string, targetVersion: number): DemoWorkspace {
  const target = state.releases.find(item => item.siteId === siteId && item.version === targetVersion);
  if (!target) throw new Error('선택한 버전을 찾지 못했습니다.');
  const version = Math.max(...state.releases.filter(item => item.siteId === siteId).map(item => item.version)) + 1;
  const release: TrackingRelease = {
    id: crypto.randomUUID(), siteId, version, config: structuredClone(target.config),
    publishedAt: stamp(), sourceVersion: targetVersion,
  };
  return {
    ...state, releases: [release, ...state.releases],
    drafts: [...state.drafts.filter(item => item.siteId !== siteId), { ...structuredClone(target.config), version: (state.drafts.find(item => item.siteId === siteId)?.version ?? 0) + 1 }],
    audit: [{ id: crypto.randomUUID(), siteId, action: 'rollback', summary: `v${targetVersion} 기준으로 v${version} 롤백`, at: release.publishedAt }, ...state.audit],
  };
}

export function registerSite(state: DemoWorkspace, input: Pick<Site, 'id' | 'companyId' | 'domain'>): DemoWorkspace {
  const id = input.id.trim();
  const domain = input.domain.trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(id)) throw new Error('siteId는 영문 소문자, 숫자, 하이픈으로 2~63자여야 합니다.');
  if (!/^[a-z0-9.-]+\.[a-z]{2,}$/.test(domain)) throw new Error('유효한 도메인을 입력하세요.');
  if (!state.companies.some(company => company.id === input.companyId)) throw new Error('업체를 선택하세요.');
  if (state.sites.some(site => site.id === id)) throw new Error('이미 등록된 siteId입니다. 기존 설정은 덮어쓰지 않습니다.');
  const site: Site = { id, companyId: input.companyId, domain, environment: 'demo', status: 'pending', sdkStatus: 'unknown' };
  return {
    ...state, sites: [...state.sites, site],
    audit: [{ id: crypto.randomUUID(), siteId: id, action: 'register', summary: `데모 사이트 ${id} 등록`, at: stamp() }, ...state.audit],
  };
}
