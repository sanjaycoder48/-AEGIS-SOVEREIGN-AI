import type { ModelId, ModelOption, VaultDocument, ViewKey } from '../types';

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

export const DEFAULT_MODEL_ID: ModelId = 'qwen2.5:7b';

export const MODEL_CATALOG: ModelOption[] = [
  {
    id: 'qwen2.5:7b',
    title: 'Qwen 2.5 7B',
    copy: 'Document reasoning and structured drafting.',
    size: '4.7 GB',
    lane: 'Text',
    route: 'Document risk analysis',
  },
  {
    id: 'qwen2.5vl:7b',
    title: 'Qwen2.5-VL 7B',
    copy: 'Scanned drawings, charts and visual inspection.',
    size: '5.4 GB',
    lane: 'Vision',
    route: 'Visual inspection',
  },
  {
    id: 'deepseek-coder:6.7b',
    title: 'DeepSeek Coder 6.7B',
    copy: 'Internal code review and secure generation.',
    size: '3.8 GB',
    lane: 'Code',
    route: 'Code analysis',
  },
];

export function modelById(modelId?: string | null): ModelOption {
  const model = MODEL_CATALOG.find((entry) => entry.id === modelId);
  const fallback = MODEL_CATALOG.find((entry) => entry.id === DEFAULT_MODEL_ID);
  if (!fallback) throw new Error('Default model is missing from the registry.');
  return model ?? fallback;
}

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
