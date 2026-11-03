import type { CommonTag, ConversionTag, DraftConfig, Provider } from './index.ts';

export type ScriptChange = {
  kind: 'common' | 'conversion';
  provider: Provider;
  action: 'add' | 'update' | 'remove';
  scriptId: string;
  before?: string;
  after?: string;
};

function detail(item: CommonTag | ConversionTag): string {
  const status = item.enabled ? '활성' : '비활성';
  if ('trackingId' in item) return `${item.trackingId}${item.inflowDomain ? ` · ${item.inflowDomain}` : ''} · ${status}`;
  return `${item.sendTo ?? item.conversionType ?? item.eventName ?? item.event} · ${status}`;
}

/** Compare script identity and values, independent of draft version or array order. */
export function diffScriptChanges(before: DraftConfig | null, after: DraftConfig): ScriptChange[] {
  const changes: ScriptChange[] = [];
  for (const kind of ['common', 'conversion'] as const) {
    const previous = kind === 'common' ? before?.common ?? [] : before?.conversions ?? [];
    const current = kind === 'common' ? after.common : after.conversions;
    const oldById = new Map(previous.map(item => [item.id, item]));
    const newIds = new Set(current.map(item => item.id));
    for (const item of current) {
      const old = oldById.get(item.id);
      if (!old) changes.push({ kind, provider: item.provider, action: 'add', scriptId: item.id, after: detail(item) });
      else if (JSON.stringify(old) !== JSON.stringify(item)) changes.push({ kind, provider: item.provider, action: 'update',
        scriptId: item.id, before: detail(old), after: detail(item) });
    }
    for (const item of previous) if (!newIds.has(item.id)) changes.push({ kind, provider: item.provider,
      action: 'remove', scriptId: item.id, before: detail(item) });
  }
  return changes;
}
