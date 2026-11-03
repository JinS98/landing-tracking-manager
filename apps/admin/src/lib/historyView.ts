import { diffScriptChanges, type ScriptChange } from '@ltm/tracking-core';
import type { AuditEntry, DemoWorkspace } from '../types/tracking';

export type HistoryItem = {
  entry: AuditEntry;
  companyId: string;
  companyName: string;
  siteId: string;
  domain: string;
  changes: ScriptChange[] | null;
};

export function historyItems(workspace: DemoWorkspace): HistoryItem[] {
  return workspace.audit.map(entry => {
    const site = workspace.sites.find(item => item.id === entry.siteId);
    const companyId = site?.companyId ?? entry.companyId ?? '';
    const company = workspace.companies.find(item => item.id === companyId);
    let changes = entry.changes ?? null;
    // Older publish/rollback records have no change payload, but immutable releases can be compared.
    if (!changes && (entry.action === 'publish' || entry.action === 'rollback') && entry.afterVersion) {
      const current = workspace.releases.find(item => item.siteId === entry.siteId && item.version === entry.afterVersion);
      const previous = entry.beforeVersion
        ? workspace.releases.find(item => item.siteId === entry.siteId && item.version === entry.beforeVersion) : null;
      if (current && (!entry.beforeVersion || previous)) changes = diffScriptChanges(previous?.config ?? null, current.config);
    }
    return { entry, companyId, companyName: company?.name ?? companyId, siteId: site?.id ?? entry.siteId,
      domain: site?.domain ?? '', changes };
  });
}

export function matchesHistory(item: HistoryItem, query: string): boolean {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const haystack = [item.companyId, item.companyName, item.siteId, item.domain,
    ...(item.changes?.flatMap(change => [change.scriptId, change.before ?? '', change.after ?? '']) ?? [])]
    .join(' ').toLocaleLowerCase();
  return words.every(word => haystack.includes(word));
}
