import type { User } from 'firebase/auth';
import type { DemoWorkspace, ImportJob, TrackingConfig } from '../types/tracking';
import type { ImportPreview } from './demoImport';

/** Every operation passes a Firebase user token to a server route. No browser Firestore writes. */
export interface AdminGateway {
  workspace(user: User): Promise<DemoWorkspace>;
  registerCompany(user: User, id: string, name: string): Promise<unknown>;
  registerSite(user: User, siteId: string, companyId: string, domain: string): Promise<unknown>;
  saveDraft(user: User, config: TrackingConfig): Promise<unknown>;
  publish(user: User, siteId: string, expectedDraftVersion: number): Promise<unknown>;
  rollback(user: User, siteId: string, targetVersion: number, expectedPublishedVersion: number): Promise<unknown>;
  importSites(user: User, jobId: string, fileName: string, preview: ImportPreview): Promise<{ job: ImportJob; reused: boolean }>;
}
