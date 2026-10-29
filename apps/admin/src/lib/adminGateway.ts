import type { Company, Site, TrackingConfig, TrackingRelease, AuditEntry } from '../types/tracking';

/** Contract for a future server adapter. Browser code must never implement its own access decision. */
export interface AdminGateway {
  listCompanies(): Promise<Company[]>;
  listSites(companyId?: string): Promise<Site[]>;
  registerSite(input: Pick<Site, 'id' | 'companyId' | 'domain' | 'environment'>): Promise<Site>;
  getDraft(siteId: string): Promise<TrackingConfig>;
  saveDraft(config: TrackingConfig, expectedVersion: number): Promise<TrackingConfig>;
  publish(siteId: string, expectedVersion: number): Promise<TrackingRelease>;
  rollback(siteId: string, targetVersion: number): Promise<TrackingRelease>;
  listAudit(siteId?: string): Promise<AuditEntry[]>;
}

// No production implementation is exported until an authenticated gateway exists.
