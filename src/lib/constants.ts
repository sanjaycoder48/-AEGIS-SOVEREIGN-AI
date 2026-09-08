import type { VaultDocument, ViewKey } from '../types';

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
export const ALLOWED_EXTENSIONS = ['pdf', 'txt', 'md', 'csv'] as const;
export const ACCEPTED_UPLOADS = '.pdf,.txt,.md,.csv';

export const VIEW_LABELS: Record<ViewKey, string> = {
  workspace: 'Workbench',
  documents: 'Knowledge vault',
  audit: 'Audit trail',
  models: 'Model registry',
};

export const SUGGESTED_QUESTIONS = [
  'Identify critical safety risks',
  'Draft an approval note',
  'List unresolved action items',
  'Summarize startup readiness',
];

export const DEMO_DOCUMENT: VaultDocument = {
  id: 'demo-p4107',
  filename: 'compressor_safety_review.txt',
  title: 'P-4107 Compressor Safety Review',
  chunks: 2,
  pages: 1,
  size_bytes: 1103,
  type: 'TXT',
  status: 'indexed',
  created_at: new Date().toISOString(),
};
