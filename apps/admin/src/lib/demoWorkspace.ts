import { parseDraftConfig, projectPublishedConfig } from '@ltm/tracking-core';
import { emptyConfig, type CommonScript, type ConversionScript, type DemoWorkspace, type Provider, type Site, type TrackingConfig, type TrackingRelease } from '../types/tracking.ts';

export type ScriptEdit =
  | { kind: 'common'; action: 'add' | 'update'; item: CommonScript }
  | { kind: 'conversion'; action: 'add' | 'update'; item: ConversionScript }
  | { kind: 'common' | 'conversion'; action: 'toggle' | 'remove'; id: string };

const stamp = () => new Date().toISOString();
export function saveDraft(state: DemoWorkspace, config: TrackingConfig, description?: string): DemoWorkspace {
  if (!state.sites.some(site => site.id === config.siteId)) throw new Error('존재하지 않는 사이트의 초안은 저장할 수 없습니다.');
  const current = state.drafts.find(item => item.siteId === config.siteId);
  if (config.version !== (current?.version ?? 0)) throw new Error('초안 버전이 변경되었습니다. 다시 확인하세요.');
  const next = { ...parseDraftConfig(config, config.siteId), version: config.version + 1 };
  return {
    ...state,
    drafts: [...state.drafts.filter(item => item.siteId !== config.siteId), next],
    audit: [{ id: crypto.randomUUID(), siteId: config.siteId, action: 'draft', summary: description ? `초안 v${next.version} · ${description}` : `초안 v${next.version} 수정`, at: stamp() }, ...state.audit],
  };
}

/** Apply one editor action, then validate and store the entire draft atomically. */
export function editScript(state: DemoWorkspace, siteId: string, edit: ScriptEdit): DemoWorkspace {
  const config = state.drafts.find(item => item.siteId === siteId) ?? emptyConfig(siteId);
  const entries = edit.kind === 'common' ? config.common : config.conversions;
  const target = 'id' in edit ? entries.find(item => item.id === edit.id) : entries.find(item => item.id === edit.item.id);
  let next: TrackingConfig;
  if (edit.action === 'add') {
    if (target) throw new Error('이미 있는 설정 ID입니다.');
    next = edit.kind === 'common'
      ? { ...config, common: [...config.common, edit.item] }
      : { ...config, conversions: [...config.conversions, edit.item] };
  } else if (edit.action === 'update') {
    if (!target || target.provider !== edit.item.provider) throw new Error('수정할 설정이 없거나 매체가 다릅니다.');
    next = edit.kind === 'common'
      ? { ...config, common: config.common.map(item => item.id === edit.item.id ? edit.item : item) }
      : { ...config, conversions: config.conversions.map(item => item.id === edit.item.id ? edit.item : item) };
  } else {
    if (!('id' in edit)) throw new Error('변경할 설정 ID가 없습니다.');
    if (!target) throw new Error('변경할 설정을 찾지 못했습니다.');
    const id = edit.id;
    if (edit.kind === 'common') {
      const common = edit.action === 'remove' ? config.common.filter(item => item.id !== id)
        : config.common.map(item => item.id === id ? { ...item, enabled: !item.enabled } : item);
      const disabling = edit.action === 'remove' || target.enabled;
      next = { ...config, common, conversions: disabling ? config.conversions.map(item => item.provider === target.provider ? { ...item, enabled: false } : item) : config.conversions };
    } else {
      next = { ...config, conversions: edit.action === 'remove' ? config.conversions.filter(item => item.id !== id)
        : config.conversions.map(item => item.id === id ? { ...item, enabled: !item.enabled } : item) };
    }
  }
  const action = { add: '추가', update: '수정', toggle: target?.enabled ? '비활성화' : '활성화', remove: '제거' }[edit.action];
  const provider = target?.provider ?? ('item' in edit ? edit.item.provider : '');
  return saveDraft(state, next, `${edit.kind === 'common' ? '공통 스크립트' : '전환 이벤트'} ${action} (${provider})`);
}

export type DraftChange = { kind: 'common' | 'conversion'; provider: Provider; action: 'add' | 'update' | 'remove' };

export function diffDraftScripts(draft: TrackingConfig, published?: TrackingConfig): DraftChange[] {
  const changes: DraftChange[] = [];
  for (const kind of ['common', 'conversion'] as const) {
    const current = kind === 'common' ? draft.common : draft.conversions;
    const previous = kind === 'common' ? published?.common ?? [] : published?.conversions ?? [];
    const oldById = new Map(previous.map(item => [item.id, item]));
    const newIds = new Set(current.map(item => item.id));
    for (const item of current) {
      const old = oldById.get(item.id);
      if (!old) changes.push({ kind, provider: item.provider, action: 'add' });
      else if (JSON.stringify(item) !== JSON.stringify(old)) changes.push({ kind, provider: item.provider, action: 'update' });
    }
    for (const item of previous) if (!newIds.has(item.id)) changes.push({ kind, provider: item.provider, action: 'remove' });
  }
  return changes;
}

const sameScripts = (left: TrackingConfig, right: TrackingConfig): boolean => diffDraftScripts(left, right).length === 0;

export function publishDraft(state: DemoWorkspace, siteId: string, expectedDraftVersion: number): DemoWorkspace {
  if (!state.sites.some(site => site.id === siteId)) throw new Error('존재하지 않는 사이트는 게시할 수 없습니다.');
  const draft = state.drafts.find(item => item.siteId === siteId);
  if (!draft) throw new Error('게시할 초안이 없습니다.');
  if (draft.version !== expectedDraftVersion) throw new Error('초안 버전이 변경되었습니다. 다시 확인하세요.');
  const latest = state.releases.find(item => item.siteId === siteId);
  if (latest && sameScripts(draft, latest.config)) throw new Error('게시본과 같은 내용입니다. 변경 후 게시하세요.');
  const version = Math.max(0, ...state.releases.filter(item => item.siteId === siteId).map(item => item.version)) + 1;
  const publishedAt = stamp();
  const publicConfig = projectPublishedConfig(draft, siteId, version, publishedAt);
  const release: TrackingRelease = { id: crypto.randomUUID(), siteId, version, config: structuredClone(draft), publicConfig, publishedAt };
  return {
    ...state, releases: [release, ...state.releases],
    audit: [{ id: crypto.randomUUID(), siteId, action: 'publish', summary: `데모 릴리스 v${version} 게시`, at: release.publishedAt }, ...state.audit],
  };
}

export function rollbackRelease(state: DemoWorkspace, siteId: string, targetVersion: number, expectedPublishedVersion: number): DemoWorkspace {
  if (!state.sites.some(site => site.id === siteId)) throw new Error('존재하지 않는 사이트는 롤백할 수 없습니다.');
  const latest = state.releases.find(item => item.siteId === siteId);
  if (!latest || latest.version !== expectedPublishedVersion) throw new Error('게시 버전이 변경되었습니다. 다시 확인하세요.');
  const target = state.releases.find(item => item.siteId === siteId && item.version === targetVersion);
  if (!target) throw new Error('선택한 버전을 찾지 못했습니다.');
  if (sameScripts(latest.config, target.config)) throw new Error('현재 게시본과 같은 내용입니다.');
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
