import type { Company, Site, TrackingConfig, TrackingRelease, AuditEntry } from '../types/tracking';

/** Future server adapter. All reads and writes require the company gateway; the browser never decides access. */
export interface AdminGateway {
  listCompanies(): Promise<Company[]>;
  listSites(companyId?: string): Promise<Site[]>;
  registerSite(input: Pick<Site, 'id' | 'companyId' | 'domain' | 'environment'>): Promise<Site>;
  getDraft(siteId: string): Promise<TrackingConfig>;
  saveDraft(config: TrackingConfig, expectedVersion: number): Promise<TrackingConfig>;
  publish(siteId: string, expectedVersion: number): Promise<TrackingRelease>;
  rollback(siteId: string, targetVersion: number): Promise<TrackingRelease>;
  listAudit(siteId: string): Promise<AuditEntry[]>;
}

// No production implementation is exported until an authenticated gateway exists.
