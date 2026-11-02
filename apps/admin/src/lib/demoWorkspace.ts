import { parseDraftConfig, projectPublishedConfig } from '@ltm/tracking-core';
import type { DemoWorkspace, Site, TrackingConfig, TrackingRelease } from '../types/tracking';

const stamp = () => new Date().toISOString();
export function saveDraft(state: DemoWorkspace, config: TrackingConfig): DemoWorkspace {
  if (!state.sites.some(site => site.id === config.siteId)) throw new Error('존재하지 않는 사이트의 초안은 저장할 수 없습니다.');
  const current = state.drafts.find(item => item.siteId === config.siteId);
  if (config.version !== (current?.version ?? 0)) throw new Error('초안 버전이 변경되었습니다. 다시 확인하세요.');
  const next = { ...parseDraftConfig(config, config.siteId), version: config.version + 1 };
  return {
    ...state,
    drafts: [...state.drafts.filter(item => item.siteId !== config.siteId), next],
    audit: [{ id: crypto.randomUUID(), siteId: config.siteId, action: 'draft', summary: `초안 v${next.version} 수정`, at: stamp() }, ...state.audit],
  };
}

export function publishDraft(state: DemoWorkspace, siteId: string): DemoWorkspace {
  if (!state.sites.some(site => site.id === siteId)) throw new Error('존재하지 않는 사이트는 게시할 수 없습니다.');
  const draft = state.drafts.find(item => item.siteId === siteId);
  if (!draft) throw new Error('게시할 초안이 없습니다.');
  const version = Math.max(0, ...state.releases.filter(item => item.siteId === siteId).map(item => item.version)) + 1;
  const publishedAt = stamp();
  const publicConfig = projectPublishedConfig(draft, siteId, version, publishedAt);
  const release: TrackingRelease = { id: crypto.randomUUID(), siteId, version, config: structuredClone(draft), publicConfig, publishedAt };
  return {
    ...state, releases: [release, ...state.releases],
    audit: [{ id: crypto.randomUUID(), siteId, action: 'publish', summary: `데모 릴리스 v${version} 게시`, at: release.publishedAt }, ...state.audit],
  };
}

export function rollbackRelease(state: DemoWorkspace, siteId: string, targetVersion: number): DemoWorkspace {
  if (!state.sites.some(site => site.id === siteId)) throw new Error('존재하지 않는 사이트는 롤백할 수 없습니다.');
  const target = state.releases.find(item => item.siteId === siteId && item.version === targetVersion);
  if (!target) throw new Error('선택한 버전을 찾지 못했습니다.');
  const version = Math.max(...state.releases.filter(item => item.siteId === siteId).map(item => item.version)) + 1;
  const publishedAt = stamp();
  const release: TrackingRelease = {
    id: crypto.randomUUID(), siteId, version, config: structuredClone(target.config),
    publicConfig: projectPublishedConfig(target.config, siteId, version, publishedAt),
    publishedAt, sourceVersion: targetVersion,
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
