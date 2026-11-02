import { useState } from 'react';
import { NavLink, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Activity, Building2, Code2, FileSpreadsheet, History, LayoutDashboard, Plus, Search, ShieldCheck } from 'lucide-react';
import ImportPage from './ImportPage';
import { demoMode } from './lib/firebase';
import { initialWorkspace, providerLabels } from './lib/demoData';
import { searchCompanies } from './lib/companySearch';
import { publishDraft, registerSite, rollbackRelease, saveDraft } from './lib/demoWorkspace';
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

function Sidebar() {
  return <aside className="sidebar">
    <div className="brand"><div className="brand-icon"><Code2 size={21}/></div><div><b>Landing Tracking</b><small>Manager Console</small></div></div>
    <nav>{menu.map(item => <NavLink key={item.to} end={item.end} to={item.to} className={({ isActive }) => 'nav-item' + (isActive ? ' active' : '')}><item.icon size={18}/>{item.label}</NavLink>)}</nav>
    <div className="sidebar-footer"><ShieldCheck size={17}/> 독립형 데모 · 운영 쓰기 차단</div>
  </aside>;
}

function Dashboard({ workspace }: { workspace: DemoWorkspace }) {
  const activeProviders = new Set(workspace.drafts.flatMap(config => config.common.filter(item => item.enabled).map(item => item.provider))).size;
  const installed = workspace.sites.filter(site => site.sdkStatus === 'installed').length;
  return <>
    <div className="page-head"><div><span className="eyebrow">OVERVIEW</span><h1>대시보드</h1><p>가상 업체와 사이트의 데모 설정 현황</p></div></div>
    <div className="stats">
      <div className="stat"><small>전체 업체</small><strong>{workspace.companies.length}</strong><span>가상 업체</span></div>
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
  return <div className="table-wrap"><table><thead><tr><th>siteId</th><th>도메인</th><th>SDK 상태</th><th>설정</th><th></th></tr></thead><tbody>{sites.map(site => <tr key={site.id}><td><strong>{site.id}</strong></td><td>{site.domain}</td><td><span className="pill gray">{site.sdkStatus === 'installed' ? '데모 설치 확인' : site.sdkStatus === 'unknown' ? '데모 미확인' : '데모 미설치'}</span></td><td>{workspace.releases.some(release => release.siteId === site.id) ? '데모 게시본 있음' : '게시본 없음'}</td><td><NavLink className="text-link" to={'/sites/' + site.id}>관리하기 →</NavLink></td></tr>)}</tbody></table></div>;
}

function Sites({ workspace, setWorkspace }: { workspace: DemoWorkspace; setWorkspace: (next: DemoWorkspace) => void }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [companyId, setCompanyId] = useState(workspace.companies[0]?.id ?? '');
  const [siteId, setSiteId] = useState('');
  const [domain, setDomain] = useState('');
  const [error, setError] = useState('');
  const visible = searchCompanies(workspace, search);
  function addSite() {
    try {
      setWorkspace(registerSite(workspace, { id: siteId, companyId, domain }));
      setSiteId(''); setDomain(''); setError('');
      navigate('/companies/' + companyId);
    } catch (reason) { setError((reason as Error).message); }
  }
  return <>
    <div className="page-head"><div><span className="eyebrow">ADVERTISERS</span><h1>업체 관리</h1><p>모든 가상 업체를 검색하고 업체별 랜딩페이지를 선택합니다.</p></div></div>
    <div className="panel"><div className="toolbar"><Search size={17}/><input aria-label="업체 또는 사이트 검색" value={search} onChange={event => setSearch(event.target.value)} placeholder="업체명, siteId, 도메인 검색"/></div>
      {visible.map(({ company, sites }) => <section className="company-section" key={company.id}><div className="panel-head"><h2><NavLink className="company-link" to={'/companies/' + company.id}>{company.name}</NavLink> <small>· {workspace.sites.filter(site => site.companyId === company.id).length}개 사이트</small></h2><span className={'pill ' + (company.status === 'active' ? 'green' : 'amber')}>{company.status === 'active' ? '활성' : '등록 대기'}</span></div>
        <SiteTable sites={sites} workspace={workspace}/>
      </section>)}
      {!visible.length && <p className="empty">검색 결과가 없습니다.</p>}
    </div>
    <div className="panel section-gap"><div className="panel-head"><h2>데모 사이트 등록</h2></div><div className="editor"><p className="muted">가상 데이터만 브라우저 메모리에 추가합니다. siteId 중복은 차단하고 기존 설정은 보존합니다.</p><div className="form-grid">
      <label>업체<select value={companyId} onChange={event => setCompanyId(event.target.value)}>{workspace.companies.map(company => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
      <label>siteId<input value={siteId} onChange={event => setSiteId(event.target.value)} placeholder="new-landing"/></label>
      <label>도메인<input value={domain} onChange={event => setDomain(event.target.value)} placeholder="landing.example"/></label>
    </div>{error && <p className="error">{error}</p>}<div className="editor-footer"><small>운영 등록 API는 연결되지 않았습니다.</small><button className="btn primary" onClick={addSite}><Plus size={16}/> 데모 등록</button></div></div></div>
  </>;
}

function CompanyDetail({ workspace }: { workspace: DemoWorkspace }) {
  const { companyId = '' } = useParams();
  const company = workspace.companies.find(item => item.id === companyId);
  if (!company) return <div className="panel empty">존재하지 않는 업체입니다.</div>;
  const sites = workspace.sites.filter(site => site.companyId === companyId);
  return <>
    <div className="page-head"><div><NavLink className="back" to="/sites">← 업체 목록</NavLink><h1>{company.name}</h1><p>업체 ID: {company.id} · {sites.length}개 사이트 · {company.status === 'active' ? '활성' : '등록 대기'}</p></div></div>
    <div className="notice"><b>데모 전용</b> — SDK 상태와 게시 현황은 브라우저 메모리의 가상 데이터입니다.</div>
    <div className="panel"><div className="panel-head"><h2>랜딩페이지</h2></div><SiteTable sites={sites} workspace={workspace}/></div>
  </>;
}

function ScriptEditor({ config, onChange }: { config: TrackingConfig; onChange: (next: TrackingConfig) => void }) {
  const [tab, setTab] = useState<'common' | 'conversion'>('common');
  const [provider, setProvider] = useState<Provider>('googleAds');
  const [trackingId, setTrackingId] = useState('');
  const [domain, setDomain] = useState('');
  const [eventValue, setEventValue] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const items = tab === 'common' ? config.common : config.conversions;
  function reset() { setTrackingId(''); setDomain(''); setEventValue(''); setEditingId(null); setError(''); }
  function apply(next: TrackingConfig): boolean {
    try { onChange(next); setError(''); return true; }
    catch (reason) { setError((reason as Error).message); return false; }
  }
  function edit(item: CommonScript | ConversionScript) {
    setEditingId(item.id); setProvider(item.provider); setError('');
    if ('trackingId' in item) { setTrackingId(item.trackingId); setDomain(item.inflowDomain ?? ''); }
    else setEventValue(item.sendTo ?? item.conversionType ?? item.eventName ?? '');
  }
  function save() {
    const value = tab === 'common' ? trackingId.trim() : eventValue.trim();
    if (!value) { setError('필수 입력값을 입력하세요.'); return; }
    if (tab === 'common') {
      const item: CommonScript = { id: editingId ?? crypto.randomUUID(), provider, enabled: editingId ? config.common.find(x => x.id === editingId)?.enabled ?? true : true, trackingId: value, ...(provider === 'naverWcs' ? { inflowDomain: domain.trim().toLowerCase() } : {}) };
      if (!apply({ ...config, common: editingId ? config.common.map(x => x.id === editingId ? item : x) : [...config.common, item] })) return;
    } else {
      const item: ConversionScript = { id: editingId ?? crypto.randomUUID(), provider, enabled: editingId ? config.conversions.find(x => x.id === editingId)?.enabled ?? true : true, event: 'consultation_complete', ...(provider === 'googleAds' ? { sendTo: value } : provider === 'naverWcs' ? { conversionType: value } : { eventName: value }) };
      if (!apply({ ...config, conversions: editingId ? config.conversions.map(x => x.id === editingId ? item : x) : [...config.conversions, item] })) return;
    }
    reset();
  }
  function toggle(itemId: string) {
    if (tab === 'common') apply({ ...config, common: config.common.map(x => x.id === itemId ? { ...x, enabled: !x.enabled } : x), conversions: config.conversions.map(x => x.provider === config.common.find(c => c.id === itemId)?.provider ? { ...x, enabled: false } : x) });
    else {
      apply({ ...config, conversions: config.conversions.map(x => x.id === itemId ? { ...x, enabled: !x.enabled } : x) });
    }
  }
  function remove(itemId: string) {
    if (tab === 'common') {
      const removed = config.common.find(x => x.id === itemId);
      if (!apply({ ...config, common: config.common.filter(x => x.id !== itemId), conversions: config.conversions.map(x => x.provider === removed?.provider ? { ...x, enabled: false } : x) })) return;
    } else if (!apply({ ...config, conversions: config.conversions.filter(x => x.id !== itemId) })) return;
    if (editingId === itemId) reset();
  }
  return <div className="panel"><div className="tabs"><button className={tab === 'common' ? 'selected' : ''} onClick={() => { setTab('common'); reset(); }}>공통 스크립트 <span>{config.common.length}</span></button><button className={tab === 'conversion' ? 'selected' : ''} onClick={() => { setTab('conversion'); reset(); }}>전환 이벤트 <span>{config.conversions.length}</span></button></div>
    <div className="script-list">{items.map(item => <div className="script-row" key={item.id}><div><b>{providerLabels[item.provider]}</b><small>{'trackingId' in item ? item.trackingId : item.sendTo ?? item.conversionType ?? item.eventName}</small></div><div className="row-actions"><label className="toggle"><input type="checkbox" checked={item.enabled} onChange={() => toggle(item.id)}/><span>{item.enabled ? '활성' : '비활성'}</span></label><button className="text-link action-link" onClick={() => edit(item)}>수정</button><button className="link-danger" onClick={() => remove(item.id)}>제거</button></div></div>)}{!items.length && <p className="empty">등록된 설정이 없습니다.</p>}</div>
    <div className="editor"><h3>{editingId ? '설정 수정' : '+ ' + (tab === 'common' ? '공통 스크립트' : '전환 이벤트') + ' 추가'}</h3><div className="form-grid">
      <label>광고 매체<select value={provider} onChange={event => { setProvider(event.target.value as Provider); setError(''); }} disabled={Boolean(editingId)}>{providers.map(key => <option key={key} value={key}>{providerLabels[key]}</option>)}</select></label>
      {tab === 'common' ? <><label>추적 ID<input value={trackingId} onChange={event => setTrackingId(event.target.value)} placeholder={provider === 'gtm' ? 'GTM-DEMO123' : provider === 'googleAds' ? 'AW-123456789' : '픽셀/계정 ID'}/></label>{provider === 'naverWcs' && <label>유입 도메인<input value={domain} onChange={event => setDomain(event.target.value)} placeholder="landing.example"/></label>}</> : <label>{provider === 'googleAds' ? 'send_to (AW ID/라벨)' : provider === 'naverWcs' ? '전환 유형' : '이벤트명'}<input value={eventValue} onChange={event => setEventValue(event.target.value)} placeholder={provider === 'googleAds' ? 'AW-123456789/DEMO_LABEL' : provider === 'naverWcs' ? 'lead' : 'Lead'}/></label>}
    </div>{error && <p className="error">{error}</p>}<div className="editor-footer"><small>데모 변경은 메모리에만 저장됩니다.</small><div className="button-row">{editingId && <button className="btn secondary" onClick={reset}>취소</button>}<button className="btn primary" onClick={save}>{editingId ? '수정 저장' : '설정 추가'}</button></div></div></div>
  </div>;
}

function SiteDetail({ workspace, setWorkspace }: { workspace: DemoWorkspace; setWorkspace: (next: DemoWorkspace) => void }) {
  const { siteId = '' } = useParams();
  const site = workspace.sites.find(item => item.id === siteId);
  const company = workspace.companies.find(item => item.id === site?.companyId);
  const config = workspace.drafts.find(item => item.siteId === siteId) ?? emptyConfig(siteId);
  const releases = workspace.releases.filter(item => item.siteId === siteId);
  const latest = releases[0];
  const changed = JSON.stringify({ common: config.common, conversions: config.conversions }) !== JSON.stringify({ common: latest?.config.common ?? [], conversions: latest?.config.conversions ?? [] });
  const [error, setError] = useState('');
  if (!site) return <div className="panel empty">존재하지 않는 사이트입니다.</div>;
  function publish() { try { setWorkspace(publishDraft(workspace, siteId)); setError(''); } catch (reason) { setError((reason as Error).message); } }
  function rollback(version: number) { try { setWorkspace(rollbackRelease(workspace, siteId, version)); setError(''); } catch (reason) { setError((reason as Error).message); } }
  return <>
    <div className="page-head"><div><NavLink className="back" to={company ? '/companies/' + company.id : '/sites'}>← {company ? company.name : '업체 목록'}</NavLink><h1>{company?.name} · {site.id}</h1><p>{site.domain} · {site.environment} · 초안 v{config.version} · {latest ? '데모 게시 v' + latest.version : '게시본 없음'}</p></div><button className="btn secondary" onClick={() => navigator.clipboard.writeText(JSON.stringify(config, null, 2))}>초안 JSON 복사</button></div>
    <div className="notice"><b>데모 전용</b> — 게시와 롤백도 브라우저 메모리에서만 실행됩니다. Firebase, CDN 및 광고 매체에는 반영되지 않습니다.</div>
    <ScriptEditor config={config} onChange={next => setWorkspace(saveDraft(workspace, next))}/>
    <div className="panel section-gap"><div className="panel-head"><h2>설정 변경사항 미리보기</h2><span className={'pill ' + (changed ? 'amber' : 'green')}>{changed ? '게시본과 다름' : '변경 없음'}</span></div>
      <div className="preview-grid"><div><h3>현재 초안</h3><pre>{JSON.stringify(config, null, 2)}</pre></div><div><h3>마지막 공개 DTO (데모)</h3><pre>{latest ? JSON.stringify(latest.publicConfig, null, 2) : '게시본 없음'}</pre></div></div>
      <div className="panel-actions"><button className="btn primary" onClick={publish} disabled={!changed}>데모 게시</button></div>{error && <p className="error panel-actions">{error}</p>}
    </div>
    <div className="panel section-gap"><div className="panel-head"><h2>데모 릴리스 이력</h2></div>{releases.length ? <ul className="history-list">{releases.map(release => <li key={release.id}><div><b>v{release.version}{release.sourceVersion ? ' · v' + release.sourceVersion + '에서 롤백' : ''}</b><span>{dateText(release.publishedAt)}</span></div><button className="btn secondary" onClick={() => rollback(release.version)} disabled={release.id === latest?.id}>이 버전으로 롤백</button></li>)}</ul> : <p className="empty">데모 게시 이력이 없습니다.</p>}</div>
  </>;
}

function Releases({ workspace }: { workspace: DemoWorkspace }) {
  return <><div className="page-head"><div><span className="eyebrow">RELEASES</span><h1>배포 이력</h1><p>브라우저 메모리의 데모 게시 및 변경 기록입니다.</p></div></div><div className="panel">{workspace.audit.length ? <ul className="history-list">{workspace.audit.map(entry => <li key={entry.id}><div><b>{entry.summary}</b><span>{entry.siteId} · {dateText(entry.at)}</span></div><NavLink className="text-link" to={'/sites/' + entry.siteId}>사이트 보기 →</NavLink></li>)}</ul> : <p className="empty">아직 기록이 없습니다.</p>}</div></>;
}
function Diagnostics() {
  return <><div className="page-head"><div><span className="eyebrow">DIAGNOSTICS</span><h1>설치 진단</h1><p>실제 SDK 설치 및 이벤트 실행 상태 연동 예정</p></div></div><div className="panel placeholder"><Activity size={34}/><h2>아직 연결되지 않은 기능</h2><p>데모 사이트의 SDK 상태는 가상 데이터입니다.</p></div></>;
}

export default function App() {
  const [workspace, setWorkspace] = useState<DemoWorkspace>(() => structuredClone(initialWorkspace));
  return <div className="shell"><Sidebar/><main className="main"><header className="topbar"><span>Workspace / Tracking</span><span className="demo-label">{demoMode ? 'DEMO MODE · 운영 쓰기 차단' : ''}</span></header><div className="content"><Routes>
    <Route path="/" element={<Dashboard workspace={workspace}/>}/>
    <Route path="/sites" element={<Sites workspace={workspace} setWorkspace={setWorkspace}/>}/>
    <Route path="/imports" element={<ImportPage workspace={workspace} setWorkspace={setWorkspace}/>}/>
    <Route path="/companies/:companyId" element={<CompanyDetail workspace={workspace}/>}/>
    <Route path="/sites/:siteId" element={<SiteDetail workspace={workspace} setWorkspace={setWorkspace}/>}/>
    <Route path="/releases" element={<Releases workspace={workspace}/>}/>
    <Route path="/diagnostics" element={<Diagnostics/>}/>
    <Route path="*" element={<Navigate to="/" replace/>}/>
  </Routes></div></main></div>;
}
