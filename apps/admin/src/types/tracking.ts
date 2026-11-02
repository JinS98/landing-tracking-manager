import type { CommonTag, ConversionTag, DraftConfig, Provider as CoreProvider, PublishedConfig } from '@ltm/tracking-core';

export type Provider = CoreProvider;

export type Company = { id: string; name: string; status: 'active' | 'pending' };
export type Site = {
  id: string;
  companyId: string;
  domain: string;
  environment: 'demo' | 'staging' | 'production';
  status: 'active' | 'pending';
  sdkStatus: 'installed' | 'not_installed' | 'unknown';
};
export type CommonScript = CommonTag;
export type ConversionScript = ConversionTag;
export type TrackingConfig = DraftConfig;
export type TrackingRelease = { id: string; siteId: string; version: number; config: TrackingConfig; publicConfig: PublishedConfig; publishedAt: string; sourceVersion?: number };
export type AuditEntry = { id: string; siteId: string; action: 'draft' | 'publish' | 'rollback' | 'register'; summary: string; at: string };
export type ImportJob = {
  id: string;
  fileName: string;
  status: 'completed' | 'partial';
  createdCount: number;
  skippedCount: number;
  errorCount: number;
  errors: { rowNumber: number; message: string }[];
  createdAt: string;
};
export type DemoWorkspace = {
  companies: Company[];
  sites: Site[];
  drafts: TrackingConfig[];
  releases: TrackingRelease[];
  audit: AuditEntry[];
  importJobs: ImportJob[];
};

export const emptyConfig = (siteId: string): TrackingConfig => ({ siteId, version: 0, common: [], conversions: [] });
