import { registerSite } from './demoWorkspace.ts';
import type { DemoWorkspace, ImportJob } from '../types/tracking';

export type ImportColumn = 'companyId' | 'companyName' | 'siteId' | 'domain';
export type ColumnMapping = Record<ImportColumn, number>;
export type ImportInput = { companyId: string; companyName: string; siteId: string; domain: string };
export type ImportRow = { rowNumber: number; input: ImportInput; status: 'create' | 'skip' | 'error'; message: string };
export type ImportPreview = { rows: ImportRow[]; createdCount: number; skippedCount: number; errorCount: number };

export const importColumns: { key: ImportColumn; label: string }[] = [
  { key: 'companyId', label: 'companyId' }, { key: 'companyName', label: '업체명' },
  { key: 'siteId', label: 'siteId' }, { key: 'domain', label: '도메인' },
];

export function suggestMapping(header: readonly unknown[]): ColumnMapping {
  const names = header.map(value => String(value ?? '').trim().toLowerCase());
  const find = (aliases: string[]) => names.findIndex(value => aliases.includes(value));
  return {
    companyId: find(['companyid', '업체 id', '업체id']),
    companyName: find(['companyname', '업체명']),
    siteId: find(['siteid', '사이트 id', '사이트id']),
    domain: find(['domain', '도메인']),
  };
}

function cell(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function validDomain(domain: string): boolean {
  return domain.length <= 253 && /\.[a-z]{2,}$/.test(domain) &&
    domain.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}

export function previewImport(workspace: DemoWorkspace, sheet: readonly (readonly unknown[])[], mapping: ColumnMapping): ImportPreview {
  if (!sheet.length || sheet.length > 501) throw new Error('첫 시트에는 헤더와 최대 500개 데이터 행만 넣을 수 있습니다.');
  const indexes = importColumns.map(column => mapping[column.key]);
  if (indexes.some(index => !Number.isInteger(index) || index < 0 || index >= sheet[0].length) ||
      new Set(indexes).size !== indexes.length) throw new Error('서로 다른 열을 네 필드에 모두 연결하세요.');

  const companies = new Map(workspace.companies.map(company => [company.id, company.name]));
  const sites = new Map(workspace.sites.map(site => [site.id, { companyId: site.companyId, domain: site.domain }]));
  const seen = new Set<string>();
  const rows: ImportRow[] = [];
  for (let index = 1; index < sheet.length; index++) {
    const raw = sheet[index];
    if (!raw.some(value => value !== null && value !== undefined && String(value).trim())) continue;
    const input: ImportInput = {
      companyId: cell(raw[mapping.companyId]), companyName: cell(raw[mapping.companyName]),
      siteId: cell(raw[mapping.siteId]), domain: cell(raw[mapping.domain]).toLowerCase(),
    };
    let message = '';
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(input.companyId)) message = 'companyId 형식이 올바르지 않습니다.';
    else if (!input.companyName || input.companyName.length > 100) message = '업체명을 입력하세요(최대 100자).';
    else if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(input.siteId)) message = 'siteId 형식이 올바르지 않습니다.';
    else if (!validDomain(input.domain)) message = '도메인 형식이 올바르지 않습니다.';
    else if (companies.has(input.companyId) && companies.get(input.companyId) !== input.companyName) message = '기존 업체명과 다릅니다.';
    else if (sites.has(input.siteId)) {
      const existing = sites.get(input.siteId)!;
      if (existing.companyId !== input.companyId || existing.domain !== input.domain) message = '기존 siteId의 업체 또는 도메인과 충돌합니다.';
    }
    if (message) {
      rows.push({ rowNumber: index + 1, input, status: 'error', message });
      continue;
    }
    const status = sites.has(input.siteId) ? 'skip' : 'create';
    rows.push({ rowNumber: index + 1, input, status, message: status === 'skip' ? seen.has(input.siteId) ? '파일 내 중복' : '기존 사이트와 동일' : '새 사이트 등록' });
    companies.set(input.companyId, input.companyName);
    sites.set(input.siteId, { companyId: input.companyId, domain: input.domain });
    seen.add(input.siteId);
  }
  if (!rows.length) throw new Error('등록할 데이터 행이 없습니다.');
  return {
    rows,
    createdCount: rows.filter(row => row.status === 'create').length,
    skippedCount: rows.filter(row => row.status === 'skip').length,
    errorCount: rows.filter(row => row.status === 'error').length,
  };
}

export function applyDemoImport(
  workspace: DemoWorkspace,
  sheet: readonly (readonly unknown[])[],
  mapping: ColumnMapping,
  jobId: string,
  fileName: string,
): { workspace: DemoWorkspace; job: ImportJob; reused: boolean; preview: ImportPreview } {
  if (!jobId.trim()) throw new Error('작업 ID가 필요합니다.');
  const preview = previewImport(workspace, sheet, mapping);
  const existing = workspace.importJobs.find(job => job.id === jobId);
  if (existing) return { workspace, job: existing, reused: true, preview };
  let next = workspace;
  for (const row of preview.rows.filter(item => item.status === 'create')) {
    if (!next.companies.some(company => company.id === row.input.companyId)) {
      next = { ...next, companies: [...next.companies, { id: row.input.companyId, name: row.input.companyName, status: 'pending' }] };
    }
    next = registerSite(next, { id: row.input.siteId, companyId: row.input.companyId, domain: row.input.domain });
  }
  const job: ImportJob = {
    id: jobId, fileName, status: preview.errorCount ? 'partial' : 'completed',
    createdCount: preview.createdCount, skippedCount: preview.skippedCount,
    errorCount: preview.errorCount,
    errors: preview.rows.filter(row => row.status === 'error').map(row => ({ rowNumber: row.rowNumber, message: row.message })),
    createdAt: new Date().toISOString(),
  };
  return { workspace: { ...next, importJobs: [job, ...next.importJobs] }, job, reused: false, preview };
}
