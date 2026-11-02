import { useMemo, useState, type ChangeEvent } from 'react';
import { readSheet } from 'read-excel-file/browser';
import { applyDemoImport, importColumns, previewImport, suggestMapping, type ColumnMapping, type ImportPreview } from './lib/demoImport';
import type { DemoWorkspace, ImportJob } from './types/tracking';

type Props = { workspace: DemoWorkspace; setWorkspace: (next: DemoWorkspace) => void;
  applyRemote?: (jobId: string, fileName: string, preview: ImportPreview) => Promise<{ job: ImportJob; reused: boolean }> };

async function sha256(value: string | ArrayBuffer): Promise<string> {
  const bytes = await crypto.subtle.digest('SHA-256', typeof value === 'string' ? new TextEncoder().encode(value) : value);
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export default function ImportPage({ workspace, setWorkspace, applyRemote }: Props) {
  const [sheet, setSheet] = useState<unknown[][] | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping | null>(null);
  const [fileName, setFileName] = useState('');
  const [fileHash, setFileHash] = useState('');
  const [fileError, setFileError] = useState('');
  const [result, setResult] = useState<{ job: ImportJob; reused: boolean; preview: ImportPreview } | null>(null);
  const review = useMemo(() => {
    if (!sheet || !mapping) return null;
    try { return { preview: previewImport(workspace, sheet, mapping), error: '' }; }
    catch (error) { return { preview: null, error: (error as Error).message }; }
  }, [workspace, sheet, mapping]);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    setSheet(null); setMapping(null); setResult(null); setFileError(''); setFileName('');
    if (!file) return;
    if (!file.name.toLowerCase().endsWith('.xlsx')) { setFileError('.xlsx 파일을 선택하세요.'); return; }
    if (file.size > 2_000_000) { setFileError('파일 크기는 2MB 이하여야 합니다.'); return; }
    try {
      const [rows, hash] = await Promise.all([readSheet(file), file.arrayBuffer().then(sha256)]);
      if (!rows.length || rows.length > 501) throw new Error('헤더와 최대 500개 데이터 행을 포함해야 합니다.');
      setSheet(rows); setMapping(suggestMapping(rows[0])); setFileName(file.name); setFileHash(hash);
    } catch (error) {
      setFileError(error instanceof Error ? error.message : '엑셀 파일을 읽지 못했습니다.');
    }
    event.target.value = '';
  }

  async function apply() {
    if (!sheet || !mapping || !review?.preview) return;
    try {
      const jobId = await sha256(fileHash + ':' + JSON.stringify(mapping));
      if (applyRemote) {
        const outcome = await applyRemote(jobId, fileName, review.preview);
        setResult({ ...outcome, preview: review.preview });
      } else {
        const outcome = applyDemoImport(workspace, sheet, mapping, jobId, fileName);
        setWorkspace(outcome.workspace);
        setResult({ job: outcome.job, reused: outcome.reused, preview: outcome.preview });
      }
      setFileError('');
    } catch (error) { setFileError((error as Error).message); }
  }

  const shown = result?.preview ?? review?.preview;
  return <>
    <div className="page-head"><div><span className="eyebrow">IMPORT</span><h1>엑셀 일괄 등록</h1><p>업체와 사이트를 미리 확인한 뒤 등록합니다.</p></div></div>
    <div className="notice">{applyRemote ? '파일은 브라우저에서 읽고 선택한 등록 행만 관리자 API로 전송합니다.' : '데모 파일은 브라우저 메모리에만 저장됩니다.'}</div>
    <div className="panel"><div className="panel-head"><h2>1. 파일 선택</h2></div><div className="import-body">
      <p>첫 시트의 첫 행에 헤더를 넣으세요. 권장 열: <code>companyId</code>, <code>companyName</code>, <code>siteId</code>, <code>domain</code>. 예시 행: <code>sample-coffee · 샘플 커피 · coffee-spring · spring.coffee.example</code>. 기존 업체를 쓰는 행은 업체명을 현재 표시 이름과 같게 입력합니다.</p>
      <p className="muted">.xlsx, 최대 2MB·500행. ID와 도메인은 텍스트 셀로 입력하세요.</p>
      <input aria-label="엑셀 파일" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={selectFile}/>
      {fileName && <p className="muted">선택한 파일: {fileName}</p>}
      {fileError && <p className="error" role="alert">{fileError}</p>}
    </div></div>
    {sheet && mapping && <div className="panel section-gap"><div className="panel-head"><h2>2. 열 연결</h2></div><div className="import-body"><div className="form-grid">
      {importColumns.map(column => <label key={column.key}>{column.label}<select value={mapping[column.key]} onChange={event => { setMapping({ ...mapping, [column.key]: Number(event.target.value) }); setResult(null); }}><option value={-1}>열 선택</option>{sheet[0].map((header, index) => <option value={index} key={index}>{String(header ?? `열 ${index + 1}`)} ({index + 1}열)</option>)}</select></label>)}
    </div>{review?.error && <p className="error" role="alert">{review.error}</p>}</div></div>}
    {shown && <div className="panel section-gap"><div className="panel-head"><h2>3. 미리보기</h2><span>{shown.createdCount}건 등록 · {shown.skippedCount}건 건너뜀 · {shown.errorCount}건 오류</span></div>
      <div className="table-wrap import-table"><table><thead><tr><th>행</th><th>업체</th><th>siteId</th><th>도메인</th><th>처리</th><th>설명</th></tr></thead><tbody>{shown.rows.map(row => <tr key={row.rowNumber}><td>{row.rowNumber}</td><td>{row.input.companyName} <small>({row.input.companyId})</small></td><td>{row.input.siteId}</td><td>{row.input.domain}</td><td><span className={'pill ' + (row.status === 'create' ? 'green' : row.status === 'error' ? 'red' : 'gray')}>{row.status === 'create' ? '등록' : row.status === 'skip' ? '건너뜀' : '오류'}</span></td><td>{row.message}</td></tr>)}</tbody></table></div>
      <div className="import-actions"><small>오류 행은 제외하고 유효한 행만 적용합니다. 같은 파일과 열 연결을 다시 적용하면 기존 작업 결과를 반환합니다.</small><button className="btn primary" onClick={apply} disabled={Boolean(result)}>{applyRemote ? '일괄 등록' : '데모 일괄 등록'}</button></div>
      {result && <p className="import-result" role="status">{result.reused ? '이미 처리한 작업입니다.' : '등록을 마쳤습니다.'} 등록 {result.job.createdCount}건, 건너뜀 {result.job.skippedCount}건, 오류 {result.job.errorCount}건</p>}
    </div>}
    <div className="panel section-gap"><div className="panel-head"><h2>작업 이력</h2></div>{workspace.importJobs.length ? <div className="table-wrap"><table><thead><tr><th>파일</th><th>상태</th><th>등록</th><th>건너뜀</th><th>오류</th></tr></thead><tbody>{workspace.importJobs.map(job => <tr key={job.id}><td>{job.fileName}{job.errors.length > 0 && <details className="import-errors"><summary>오류 행 보기</summary><ul>{job.errors.map(error => <li key={error.rowNumber}>{error.rowNumber}행: {error.message}</li>)}</ul></details>}</td><td>{job.status === 'completed' ? '완료' : '일부 오류'}</td><td>{job.createdCount}</td><td>{job.skippedCount}</td><td>{job.errorCount}</td></tr>)}</tbody></table></div> : <p className="empty">아직 처리한 파일이 없습니다.</p>}</div>
  </>;
}
