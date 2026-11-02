import { useEffect, useState } from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { NavLink, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Activity, Building2, ChevronRight, CircleHelp, Code2, FileSpreadsheet, History, LayoutDashboard, Plus, Search, ShieldCheck } from 'lucide-react';
import ImportPage from './ImportPage';
import { auth, demoMode, googleProvider } from './lib/firebase';
import { liveGateway } from './lib/liveGateway';
import { initialWorkspace, providerLabels } from './lib/demoData';
import { searchCompanies } from './lib/companySearch';
import { diffDraftScripts, editScript, publishDraft, registerSite, rollbackRelease, type ScriptEdit } from './lib/demoWorkspace';
import { emptyConfig, type CommonScript, type ConversionScript, type DemoWorkspace, type Provider, type Site, type TrackingConfig } from './types/tracking';

const providers = Object.keys(providerLabels) as Provider[];
const menu = [
  { to: '/', label: '대시보드', icon: LayoutDashboard, end: true },
  { to: '/sites', label: '업체 관리', icon: Building2, end: false },
  { to: '/imports', label: '엑셀 일괄 등록', icon: FileSpreadsheet, end: false },
  { to: '/releases', label: '배포 이력', icon: History, end: false },
  { to: '/diagnostics', label: '설치 진단', icon: Activity, end: false },
];
const dateText = (value: string) => new Date(value).toLocaleString('ko-KR');
const emptyWorkspace: DemoWorkspace = { companies: [], sites: [], drafts: [], releases: [], audit: [], importJobs: [] };
type WorkspaceActions = {
  registerCompany(id: string, name: string): Promise<void>;
  registerSite(id: string, companyId: string, domain: string): Promise<void>;
  editScript(siteId: string, edit: ScriptEdit): Promise<void>;
  publish(siteId: string, version: number): Promise<void>;
  rollback(siteId: string, targetVersion: number, currentVersion: number): Promise<void>;
};

function Sidebar() {
  return <aside className="sidebar">
    <div className="brand"><div className="brand-icon"><Code2 size={21}/></div><div><b>Landing Tracking</b><small>Manager Console</small></div></div>
    <div className="nav-caption">워크스페이스</div><nav aria-label="주 메뉴">{menu.map(item => <NavLink key={item.to} end={item.end} to={item.to} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}><item.icon size={18}/>{item.label}</NavLink>)}</nav>
    <div className="sidebar-footer"><ShieldCheck size={17}/> {demoMode ? '데모 작업공간' : '관리자 작업공간'}</div>
  </aside>;
}

function CompanyRail({ workspace }: { workspace: DemoWorkspace }) {
  const [query, setQuery] = useState('');
  const matches = searchCompanies(workspace, query);
  return <aside className="company-rail" aria-label="업체 빠른 이동">
    <div className="rail-search"><Search size={16}/><input aria-label="빠른 업체 검색" placeholder="업체 검색" value={query} onChange={event => setQuery(event.target.value)}/></div>
    <div className="rail-meta"><span>업체 <b>{workspace.companies.length}</b>개</span><NavLink to="/sites">전체 보기 <ChevronRight size={13}/></NavLink></div>
    <div className="rail-list">{matches.map(({ company, sites }) => <div key={company.id} className="rail-company"><NavLink to={'/companies/' + company.id} className={({ isActive }) => 'rail-company-link' + (isActive ? ' active' : '')}><span className="rail-avatar">{company.name.slice(0, 1)}</span><span className="rail-company-name"><b>{company.name}</b><small>{sites.length}개 사이트</small></span><ChevronRight size={14}/></NavLink>{sites.map(site => <NavLink key={site.id} to={'/sites/' + site.id} className={({ isActive }) => 'rail-site' + (isActive ? ' active' : '')}>{site.id}</NavLink>)}</div>)}{!matches.length && <p className="rail-empty">검색 결과가 없습니다.</p>}</div>
    <div className="rail-footer">{demoMode ? '가상 업체 데이터 · 브라우저 메모리' : 'Firestore 업체·사이트 데이터'}</div>
  </aside>;
}

function Dashboard({ workspace }: { workspace: DemoWorkspace }) {
  const activeProviders = new Set(workspace.drafts.flatMap(config => config.common.filter(item => item.enabled).map(item => item.provider))).size;
  const installed = workspace.sites.filter(site => site.sdkStatus === 'installed').length;
  return <>
    <div className="page-head"><div><span className="eyebrow">OVERVIEW</span><h1>대시보드</h1><p>업체와 사이트의 설정 현황</p></div></div>
    <div className="stats">
      <div className="stat"><small>전체 업체</small><strong>{workspace.companies.length}</strong><span>등록된 업체</span></div>
      <div className="stat"><small>전체 사이트</small><strong>{workspace.sites.length}</strong><span>여러 사이트 등록 가능</span></div>
      <div className="stat"><small>활성 매체</small><strong>{activeProviders}</strong><span>초안에서 활성화된 매체 종류</span></div>
      <div className="stat"><small>SDK 확인</small><strong>{installed}/{workspace.sites.length}</strong><span>실제 설치 진단 미연동</span></div>
    </div>
    <div className="panel"><div className="panel-head"><h2>최근 설정 변경 및 게시 이력</h2><NavLink className="text-link" to="/releases">전체 보기 →</NavLink></div>
      {workspace.audit.length ? <ul className="history-list">{workspace.audit.slice(0, 5).map(entry => <li key={entry.id}><b>{entry.summary}</b><span>{entry.siteId} · {dateText(entry.at)}</span></li>)}</ul> : <p className="empty">아직 변경 이력이 없습니다.</p>}
    </div>
  </>;
}

function SiteTable({ sites, workspace }: { sites: Site[]; workspace: DemoWorkspace }) {
  if (!sites.length) return <p className="empty">등록된 사이트가 없습니다.</p>;
  return <div className="table-wrap"><table><thead><tr><th>siteId</th><th>도메인</th><th>SDK 상태</th><th>설정</th><th></th></tr></thead><tbody>{sites.map(site => <tr key={site.id}><td><strong>{site.id}</strong></td><td>{site.domain}</td><td><span className="pill gray">{site.sdkStatus === 'installed' ? '신호 수신' : site.sdkStatus === 'unknown' ? '미확인' : '미설치 예시'}</span></td><td>{workspace.releases.some(release => release.siteId === site.id) ? '게시본 있음' : '게시본 없음'}</td><td><NavLink className="text-link" to={'/sites/' + site.id}>관리하기 →</NavLink></td></tr>)}</tbody></table></div>;
}

function Sites({ workspace, actions }: { workspace: DemoWorkspace; actions: WorkspaceActions }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [companyId, setCompanyId] = useState(workspace.companies[0]?.id ?? '');
  const [siteId, setSiteId] = useState('');
  const [domain, setDomain] = useState('');
  const [newCompanyId, setNewCompanyId] = useState('');
  const [newCompanyName, setNewCompanyName] = useState('');
  const [error, setError] = useState('');
  const visible = searchCompanies(workspace, search);
  const selectedCompanyId = companyId || workspace.companies[0]?.id || '';
  async function addSite() {
    try {
      await actions.registerSite(siteId, selectedCompanyId, domain);
      setSiteId(''); setDomain(''); setError('');
      navigate('/companies/' + selectedCompanyId);
    } catch (reason) { setError((reason as Error).message); }
  }
  async function addCompany() {
    try {
      await actions.registerCompany(newCompanyId, newCompanyName);
      setCompanyId(newCompanyId.trim()); setNewCompanyId(''); setNewCompanyName(''); setError('');
    } catch (reason) { setError((reason as Error).message); }
  }
  return <>
    <div className="page-head"><div><span className="eyebrow">ADVERTISERS</span><h1>업체 관리</h1><p>업체를 검색하고 업체별 랜딩페이지를 선택합니다.</p></div></div>
    <div className="panel"><div className="toolbar"><Search size={17}/><input aria-label="업체 또는 사이트 검색" value={search} onChange={event => setSearch(event.target.value)} placeholder="업체명, siteId, 도메인 검색"/></div>
      {visible.map(({ company, sites }) => <section className="company-section" key={company.id}><div className="panel-head"><h2><NavLink className="company-link" to={'/companies/' + company.id}>{company.name}</NavLink> <small>· {workspace.sites.filter(site => site.companyId === company.id).length}개 사이트</small></h2><span className={'pill ' + (company.status === 'active' ? 'green' : 'amber')}>{company.status === 'active' ? '활성' : '등록 대기'}</span></div>
        <SiteTable sites={sites} workspace={workspace}/>
      </section>)}
      {!visible.length && <p className="empty">검색 결과가 없습니다.</p>}
    </div>
    <div className="panel section-gap"><div className="panel-head"><h2>업체 등록</h2></div><div className="editor"><div className="form-grid">
      <label>업체 ID<input value={newCompanyId} onChange={event => setNewCompanyId(event.target.value)} placeholder="sample-company"/></label>
      <label>업체명<input value={newCompanyName} onChange={event => setNewCompanyName(event.target.value)} placeholder="샘플 업체"/></label>
    </div><div className="editor-footer"><small>한 업체에 여러 랜딩 사이트를 등록할 수 있습니다.</small><button className="btn primary" onClick={addCompany}>업체 등록</button></div></div></div>
    <div className="panel section-gap"><div className="panel-head"><h2>랜딩 사이트 등록</h2></div><div className="editor"><p className="muted">사이트를 등록한 뒤 매체 설정을 저장하고 게시하세요.</p><div className="form-grid">
      <label>업체<select value={selectedCompanyId} onChange={event => setCompanyId(event.target.value)}>{workspace.companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
      <label>siteId<input value={siteId} onChange={event => setSiteId(event.target.value)} placeholder="new-landing"/></label>
      <label>도메인<input value={domain} onChange={event => setDomain(event.target.value)} placeholder="landing.example"/></label>
    </div>{error && <p className="error">{error}</p>}<div className="editor-footer"><small>사이트 ID는 등록 후 변경할 수 없습니다.</small><button className="btn primary" onClick={addSite} disabled={!workspace.companies.length}><Plus size={16}/> 사이트 등록</button></div></div></div>
  </>;
}

function CompanyDetail({ workspace }: { workspace: DemoWorkspace }) {
  const { companyId = '' } = useParams();
  const company = workspace.companies.find(item => item.id === companyId);
  if (!company) return <div className="panel empty">존재하지 않는 업체입니다.</div>;
  const sites = workspace.sites.filter(site => site.companyId === companyId);
  return <>
    <div className="page-head"><div><NavLink className="back" to="/sites">← 업체 목록</NavLink><h1>{company.name}</h1><p>업체 ID: {company.id} · {sites.length}개 사이트 · {company.status === 'active' ? '활성' : '등록 대기'}</p></div></div>
    {demoMode && <div className="notice"><b>데모 전용</b> — SDK 상태와 게시 현황은 브라우저 메모리의 가상 데이터입니다.</div>}
    <div className="panel"><div className="panel-head"><h2>랜딩페이지</h2></div><SiteTable sites={sites} workspace={workspace}/></div>
  </>;
}

function ScriptEditor({ config, onChange }: { config: TrackingConfig; onChange: (edit: ScriptEdit) => Promise<void> }) {
  const [tab, setTab] = useState<'common' | 'conversion'>('common');
  const [provider, setProvider] = useState<Provider>('googleAds');
  const [trackingId, setTrackingId] = useState('');
  const [domain, setDomain] = useState('');
  const [eventValue, setEventValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const items = tab === 'common' ? config.common : config.conversions;
  const activeCommonProviders = config.common.filter(item => item.enabled).map(item => item.provider);
  const selectedProvider = tab === 'conversion' && !editingId && !activeCommonProviders.includes(provider)
    ? activeCommonProviders[0] ?? provider : provider;
  const availableProviders = tab === 'common' ? providers : editingId ? [provider] : activeCommonProviders;
  function reset() { setTrackingId(''); setDomain(''); setEventValue(''); setEditingId(null); setError(''); }
  async function apply(edit: ScriptEdit): Promise<boolean> {
    try { await onChange(edit); setError(''); return true; }
    catch (reason) { setError((reason as Error).message); return false; }
  }
  function edit(item: CommonScript | ConversionScript) {
    setEditingId(item.id); setProvider(item.provider); setError('');
    if ('trackingId' in item) { setTrackingId(item.trackingId); setDomain(item.inflowDomain ?? ''); }
    else setEventValue(item.sendTo ?? item.conversionType ?? item.eventName ?? '');
  }
  async function save() {
    if (tab === 'conversion' && !editingId && !activeCommonProviders.includes(selectedProvider)) {
      setError('먼저 활성 공통 스크립트를 추가하세요.'); return;
    }
    const value = tab === 'common' ? trackingId.trim() : eventValue.trim();
    if (!value) { setError('필수 입력값을 입력하세요.'); return; }
    if (tab === 'common') {
      const item: CommonScript = { id: editingId ?? crypto.randomUUID(), provider: selectedProvider, enabled: editingId ? config.common.find(x => x.id === editingId)?.enabled ?? true : true, trackingId: value, ...(selectedProvider === 'naverWcs' ? { inflowDomain: domain.trim().toLowerCase() } : {}) };
      if (!await apply({ kind: 'common', action: editingId ? 'update' : 'add', item })) return;
    } else {
      const item: ConversionScript = { id: editingId ?? crypto.randomUUID(), provider: selectedProvider, enabled: editingId ? config.conversions.find(x => x.id === editingId)?.enabled ?? true : true, event: 'consultation_complete', ...(selectedProvider === 'googleAds' ? { sendTo: value } : selectedProvider === 'naverWcs' ? { conversionType: value } : { eventName: value }) };
      if (!await apply({ kind: 'conversion', action: editingId ? 'update' : 'add', item })) return;
    }
    reset();
  }
  async function toggle(itemId: string) {
    await apply({ kind: tab, action: 'toggle', id: itemId });
  }
  async function remove(itemId: string) {
    if (!await apply({ kind: tab, action: 'remove', id: itemId })) return;
    if (editingId === itemId) reset();
  }
  return <div className="panel"><div className="tabs"><button className={tab === 'common' ? 'selected' : ''} onClick={() => { setTab('common'); reset(); }}>공통 스크립트 <span>{config.common.length}</span></button><button className={tab === 'conversion' ? 'selected' : ''} onClick={() => { setTab('conversion'); setProvider(activeCommonProviders[0] ?? 'googleAds'); reset(); }}>전환 이벤트 <span>{config.conversions.length}</span></button></div>
    <div className="script-list">{items.map(item => <div className="script-row" key={item.id}><div><b>{providerLabels[item.provider]}</b><small>{'trackingId' in item ? item.trackingId : item.sendTo ?? item.conversionType ?? item.eventName}</small></div><div className="row-actions"><label className="toggle"><input type="checkbox" checked={item.enabled} onChange={() => toggle(item.id)}/><span>{item.enabled ? '활성' : '비활성'}</span></label><button className="text-link action-link" onClick={() => edit(item)}>수정</button><button className="link-danger" onClick={() => remove(item.id)}>제거</button></div></div>)}{!items.length && <p className="empty">등록된 설정이 없습니다.</p>}</div>
    <div className="editor"><h3>{editingId ? '설정 수정' : '+ ' + (tab === 'common' ? '공통 스크립트' : '전환 이벤트') + ' 추가'}</h3><div className="form-grid">
      <label>광고 매체<select value={selectedProvider} onChange={event => { setProvider(event.target.value as Provider); setError(''); }} disabled={Boolean(editingId) || (tab === 'conversion' && availableProviders.length === 0)}>{availableProviders.length ? availableProviders.map(key => <option key={key} value={key}>{providerLabels[key]}</option>) : <option value={selectedProvider}>활성 공통 설정 없음</option>}</select></label>
      {tab === 'common' ? <><label>추적 ID<input value={trackingId} onChange={event => setTrackingId(event.target.value)} placeholder={selectedProvider === 'gtm' ? 'GTM-DEMO123' : selectedProvider === 'googleAds' ? 'AW-123456789' : selectedProvider === 'meta' ? '123456789012345' : '픽셀/계정 ID'}/></label>{selectedProvider === 'naverWcs' && <label>유입 도메인<input value={domain} onChange={event => setDomain(event.target.value)} placeholder="landing.example"/></label>}</> : <label>{selectedProvider === 'googleAds' ? 'send_to (AW ID/라벨)' : selectedProvider === 'naverWcs' ? '전환 유형' : '이벤트명'}<input value={eventValue} onChange={event => setEventValue(event.target.value)} placeholder={selectedProvider === 'googleAds' ? 'AW-123456789/DEMO_LABEL' : selectedProvider === 'naverWcs' ? 'lead' : selectedProvider === 'karrot' ? 'SubmitApplication' : selectedProvider === 'tiktok' ? 'SubmitForm' : 'Lead'}/></label>}
    </div>{tab === 'conversion' && !editingId && !activeCommonProviders.length && <p className="editor-hint">전환 이벤트를 추가하려면 먼저 공통 스크립트를 활성화하세요.</p>}{tab === 'common' && <p className="editor-hint">공통 스크립트를 비활성화하거나 제거하면 연결된 전환 이벤트도 비활성화됩니다.</p>}{error && <p className="error" role="alert">{error}</p>}<div className="editor-footer"><small>{demoMode ? '데모 변경은 메모리에만 저장됩니다.' : '변경 사항은 Firestore 초안에 저장됩니다.'}</small><div className="button-row">{editingId && <button className="btn secondary" onClick={reset}>취소</button>}<button className="btn primary" onClick={save} disabled={tab === 'conversion' && !editingId && !activeCommonProviders.length}>{editingId ? '수정 저장' : '설정 추가'}</button></div></div></div>
  </div>;
}

function SiteDetail({ workspace, actions }: { workspace: DemoWorkspace; actions: WorkspaceActions }) {
  const { siteId = '' } = useParams();
  const site = workspace.sites.find(item => item.id === siteId);
  const company = workspace.companies.find(item => item.id === site?.companyId);
  const config = workspace.drafts.find(item => item.siteId === siteId) ?? emptyConfig(siteId);
  const releases = workspace.releases.filter(item => item.siteId === siteId);
  const latest = releases[0];
  const changes = diffDraftScripts(config, latest?.config);
  const changed = !latest || changes.length > 0;
  const canPublish = workspace.drafts.some(item => item.siteId === siteId) && changed;
  const [error, setError] = useState('');
  if (!site) return <div className="panel empty">존재하지 않는 사이트입니다.</div>;
  async function publish() { try { await actions.publish(siteId, config.version); setError(''); } catch (reason) { setError((reason as Error).message); } }
  async function rollback(version: number) { try { await actions.rollback(siteId, version, latest?.version ?? 0); setError(''); } catch (reason) { setError((reason as Error).message); } }
  return <>
    <div className="page-head"><div><NavLink className="back" to={company ? '/companies/' + company.id : '/sites'}>← {company ? company.name : '업체 목록'}</NavLink><h1>{company?.name} · {site.id}</h1><p>{site.domain} · {site.environment} · 초안 v{config.version} · {latest ? (demoMode ? '데모 게시 v' : '게시 v') + latest.version : '게시본 없음'}</p></div><button className="btn secondary" onClick={() => navigator.clipboard.writeText(JSON.stringify(config, null, 2))}>초안 JSON 복사</button></div>
    <div className="notice">{demoMode ? '데모 게시와 롤백은 브라우저 메모리에서만 실행됩니다.' : '게시하면 SDK가 읽는 공개 설정에 반영됩니다. 매체 스크립트 실행은 랜딩의 SDK 설치와 동의 상태에 따릅니다.'}</div>
    <ScriptEditor key={siteId} config={config} onChange={edit => actions.editScript(siteId, edit)}/>
    <div className="panel section-gap"><div className="panel-head"><h2>설정 변경사항 미리보기</h2><span className={'pill ' + (changed ? 'amber' : 'green')}>{!latest ? '게시본 없음' : changed ? '게시본과 다름' : '변경 없음'}</span></div>
      <div className="change-summary">{changes.length ? <ul>{changes.map((item, index) => <li key={`${item.kind}-${item.provider}-${index}`}>{item.kind === 'common' ? '공통 스크립트' : '전환 이벤트'} · {providerLabels[item.provider]} · {item.action === 'add' ? '추가' : item.action === 'update' ? '수정' : '제거'}</li>)}</ul> : <span>{latest ? '게시본과 같은 설정입니다.' : '초안에 등록된 설정이 없습니다.'}</span>}</div>
      <div className="preview-grid"><div><h3>현재 초안</h3><pre>{JSON.stringify(config, null, 2)}</pre></div><div><h3>마지막 공개 DTO</h3><pre>{latest ? JSON.stringify(latest.publicConfig, null, 2) : '게시본 없음'}</pre></div></div>
      <div className="panel-actions"><button className="btn primary" onClick={publish} disabled={!canPublish}>{demoMode ? '데모 게시' : '설정 게시'}</button></div>{error && <p className="error panel-actions" role="alert">{error}</p>}
    </div>
    <div className="panel section-gap"><div className="panel-head"><h2>릴리스 이력</h2></div>{releases.length ? <ul className="history-list">{releases.map(release => <li key={release.id}><div><b>v{release.version}{release.sourceVersion ? ' · v' + release.sourceVersion + '에서 롤백' : ''}</b><span>{dateText(release.publishedAt)}</span></div><button className="btn secondary" onClick={() => rollback(release.version)} disabled={release.id === latest?.id}>이 버전으로 롤백</button></li>)}</ul> : <p className="empty">게시 이력이 없습니다.</p>}</div>
  </>;
}

function Releases({ workspace }: { workspace: DemoWorkspace }) {
  const [siteFilter, setSiteFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const entries = workspace.audit.filter(entry => (siteFilter === 'all' || entry.siteId === siteFilter) && (actionFilter === 'all' || entry.action === actionFilter));
  const actionName = { draft: '초안', publish: '게시', rollback: '롤백', register: '사이트 등록', registerCompany: '업체 등록' };
  return <><div className="page-head"><div><span className="eyebrow">RELEASES</span><h1>변경 및 배포 이력</h1><p>수행한 작업을 사이트별로 확인합니다.</p></div>{demoMode && <span className="pill amber">데모 기록</span>}</div>
    <div className="stats compact-stats"><div className="stat"><small>전체 기록</small><strong>{workspace.audit.length}</strong><span>{demoMode ? '브라우저 메모리' : 'Firestore 감사 기록'}</span></div><div className="stat"><small>게시</small><strong>{workspace.audit.filter(entry => entry.action === 'publish').length}</strong><span>릴리스</span></div><div className="stat"><small>롤백</small><strong>{workspace.audit.filter(entry => entry.action === 'rollback').length}</strong><span>새 버전으로 복원</span></div></div>
    <div className="panel"><div className="panel-head"><h2>감사 로그</h2><span className="muted">{entries.length}건 표시</span></div><div className="filter-bar"><label>사이트<select aria-label="이력 사이트 필터" value={siteFilter} onChange={event => setSiteFilter(event.target.value)}><option value="all">전체 사이트</option>{workspace.sites.map(site => <option key={site.id} value={site.id}>{site.id}</option>)}</select></label><label>작업<select aria-label="이력 작업 필터" value={actionFilter} onChange={event => setActionFilter(event.target.value)}><option value="all">전체 작업</option>{Object.entries(actionName).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label></div>
      {entries.length ? <div className="table-wrap"><table><thead><tr><th>시간</th><th>작업</th><th>사이트</th><th>변경 내용</th><th>주체</th><th>버전</th><th></th></tr></thead><tbody>{entries.map(entry => <tr key={entry.id}><td>{dateText(entry.at)}</td><td><span className={'pill ' + (entry.action === 'rollback' ? 'amber' : entry.action === 'publish' ? 'green' : 'gray')}>{actionName[entry.action]}</span></td><td><strong>{entry.siteId}</strong></td><td>{entry.summary}</td><td>{entry.actorRef ?? '데모 기록'}</td><td>{entry.beforeVersion === undefined ? '—' : `${entry.beforeVersion} → ${entry.afterVersion}`}</td><td><NavLink className="text-link" to={'/sites/' + entry.siteId}>보기</NavLink></td></tr>)}</tbody></table></div> : <p className="empty">선택한 조건의 이력이 없습니다.</p>}
    </div></>;
}
function Diagnostics({ workspace }: { workspace: DemoWorkspace }) {
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('all');
  const sites = workspace.sites.filter(site => (status === 'all' || site.sdkStatus === status) && (site.id.toLowerCase().includes(query.toLowerCase()) || site.domain.toLowerCase().includes(query.toLowerCase())));
  const count = (value: Site['sdkStatus']) => workspace.sites.filter(site => site.sdkStatus === value).length;
  const statusLabel = { installed: demoMode ? '설치 확인 예시' : '초기화 신호 수신', not_installed: '미설치 예시', unknown: '미확인' };
  return <><div className="page-head"><div><span className="eyebrow">DIAGNOSTICS</span><h1>설치 진단</h1><p>사이트별 SDK 진단 상태를 확인합니다.</p></div>{demoMode && <span className="pill amber">가상 상태</span>}</div>
    <div className="notice">{demoMode ? '화면 시연용 가상 값입니다.' : 'SDK 초기화 신호는 브라우저에서 보낸 관측값이며 광고 매체의 실제 수신을 증명하지 않습니다.'} 미확인은 관측 자료가 없다는 뜻이며 미설치를 입증하지 않습니다.</div>
    <div className="stats compact-stats"><div className="stat"><small>{demoMode ? '설치 확인 예시' : '초기화 신호 수신'}</small><strong>{count('installed')}</strong><span>광고 수신 검증 아님</span></div><div className="stat"><small>미설치 예시</small><strong>{count('not_installed')}</strong><span>데모 전용</span></div><div className="stat"><small>미확인</small><strong>{count('unknown')}</strong><span>관측 자료 없음</span></div></div>
    <div className="panel"><div className="panel-head"><h2>사이트별 상태</h2><span className="muted">{sites.length}개 사이트</span></div><div className="filter-bar"><div className="toolbar"><Search size={17}/><input aria-label="진단 사이트 검색" placeholder="siteId 또는 도메인 검색" value={query} onChange={event => setQuery(event.target.value)}/></div><select aria-label="진단 상태 필터" value={status} onChange={event => setStatus(event.target.value)}><option value="all">전체 상태</option><option value="installed">설치 확인 예시</option><option value="not_installed">미설치 예시</option><option value="unknown">미확인</option></select></div>
      {sites.length ? <div className="table-wrap"><table><thead><tr><th>사이트</th><th>도메인</th><th>표시 상태</th><th>최근 신호</th><th></th></tr></thead><tbody>{sites.map(site => <tr key={site.id}><td><strong>{site.id}</strong></td><td>{site.domain}</td><td><span className={'pill ' + (site.sdkStatus === 'installed' ? 'green' : site.sdkStatus === 'not_installed' ? 'amber' : 'gray')}>{statusLabel[site.sdkStatus]}</span></td><td>{site.lastDiagnosticAt ? `${dateText(site.lastDiagnosticAt)} · ${site.lastDiagnosticKind}` : '수집된 신호 없음'}</td><td><NavLink className="text-link" to={'/sites/' + site.id}>사이트 보기</NavLink></td></tr>)}</tbody></table></div> : <p className="empty">검색 결과가 없습니다.</p>}
    </div><div className="diagnostic-explainer"><CircleHelp size={18}/><p>브라우저 신호는 설치 동작을 확인하는 참고 자료입니다. 매체 수신과 전환은 실제 랜딩과 광고 플랫폼에서 별도로 확인해야 합니다.</p></div></>;
}

export default function App() {
  const [workspace, setWorkspace] = useState<DemoWorkspace>(() => demoMode ? structuredClone(initialWorkspace) : emptyWorkspace);
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(demoMode);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!auth) return;
    return onAuthStateChanged(auth, account => {
      setUser(account); setAuthReady(true); setWorkspace(emptyWorkspace); setError('');
      if (account) { setLoading(true); liveGateway.workspace(account).then(setWorkspace).catch(reason => setError((reason as Error).message)).finally(() => setLoading(false)); }
      else setWorkspace(emptyWorkspace);
    });
  }, []);
  async function refresh(account: User) { setWorkspace(await liveGateway.workspace(account)); setError(''); }
  function account(): User { if (!user) throw new Error('먼저 로그인하세요.'); return user; }
  const actions: WorkspaceActions = {
    async registerCompany(id, name) {
      if (demoMode) {
        if (!/^[A-Za-z0-9_-]{1,100}$/.test(id.trim()) || !name.trim()) throw new Error('업체 ID와 이름을 확인하세요.');
        if (workspace.companies.some(item => item.id === id.trim())) throw new Error('이미 등록된 업체 ID입니다.');
        setWorkspace({ ...workspace, companies: [...workspace.companies, { id: id.trim(), name: name.trim(), status: 'active' }] });
      } else { const current = account(); await liveGateway.registerCompany(current, id, name); await refresh(current); }
    },
    async registerSite(id, companyId, domain) {
      if (demoMode) setWorkspace(registerSite(workspace, { id, companyId, domain }));
      else { const current = account(); await liveGateway.registerSite(current, id, companyId, domain); await refresh(current); }
    },
    async editScript(siteId, edit) {
      if (demoMode) setWorkspace(editScript(workspace, siteId, edit));
      else {
        const current = account();
        const next = editScript(workspace, siteId, edit).drafts.find(item => item.siteId === siteId);
        const previous = workspace.drafts.find(item => item.siteId === siteId);
        if (!next || !previous) throw new Error('초안을 찾지 못했습니다.');
        await liveGateway.saveDraft(current, { ...next, version: previous.version });
        await refresh(current);
      }
    },
    async publish(siteId, version) {
      if (demoMode) setWorkspace(publishDraft(workspace, siteId, version));
      else { const current = account(); await liveGateway.publish(current, siteId, version); await refresh(current); }
    },
    async rollback(siteId, targetVersion, currentVersion) {
      if (demoMode) setWorkspace(rollbackRelease(workspace, siteId, targetVersion, currentVersion));
      else { const current = account(); await liveGateway.rollback(current, siteId, targetVersion, currentVersion); await refresh(current); }
    },
  };
  if (!authReady) return <main className="content"><div className="panel">로그인 상태를 확인하고 있습니다.</div></main>;
  if (!demoMode && loading) return <main className="content"><div className="panel">관리자 데이터를 불러오는 중입니다.</div></main>;
  if (!demoMode && !user) return <main className="content"><div className="panel"><h1>Landing Tracking Manager</h1><p>관리자 Firebase 계정으로 로그인하세요.</p><button className="btn primary" onClick={() => { if (auth) void signInWithPopup(auth, googleProvider).catch(reason => setError((reason as Error).message)); }}>Google 계정으로 로그인</button>{error && <p className="error" role="alert">{error}</p>}</div></main>;
  return <div className="shell"><Sidebar/><CompanyRail workspace={workspace}/><main className="main"><header className="topbar"><div className="breadcrumb"><span>마케팅 도구</span><ChevronRight size={14}/><b>랜딩 추적 관리</b></div><span className="demo-label">{demoMode ? '데모 모드' : user?.email}</span>{!demoMode && auth && <button className="btn secondary" onClick={() => { if (auth) void signOut(auth); }}>로그아웃</button>}</header><div className="content">{loading && <p role="status">설정을 불러오는 중입니다.</p>}{error && <p className="error" role="alert">{error}</p>}<Routes>
    <Route path="/" element={<Dashboard workspace={workspace}/>}/>
    <Route path="/sites" element={<Sites workspace={workspace} actions={actions}/>}/>
    <Route path="/imports" element={<ImportPage workspace={workspace} setWorkspace={setWorkspace} applyRemote={demoMode ? undefined : async (jobId, fileName, preview) => { const current = account(); const result = await liveGateway.importSites(current, jobId, fileName, preview); await refresh(current); return result; }}/>}/>
    <Route path="/companies/:companyId" element={<CompanyDetail workspace={workspace}/>}/>
    <Route path="/sites/:siteId" element={<SiteDetail workspace={workspace} actions={actions}/>}/>
    <Route path="/releases" element={<Releases workspace={workspace}/>}/>
    <Route path="/diagnostics" element={<Diagnostics workspace={workspace}/>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></div></main></div>;
}
