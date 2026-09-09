import type { ChatResponse, EngineMode } from '../types';
import { DEFAULT_MODEL_ID, modelById } from './constants';

export type FindingSeverity = 'high' | 'medium' | 'low';

export interface Finding {
  id: string;
  severity: FindingSeverity;
  text: string;
}

export interface AnswerBlock {
  id: string;
  kind: 'heading' | 'paragraph' | 'list' | 'findings';
  text?: string;
  items?: string[];
  findings?: Finding[];
}

/** Matches the review convention the documents use: "F-01 HIGH: ...". */
const FINDING_PATTERN = /^(F-\d+)\s+(CRITICAL|HIGH|MEDIUM|LOW)\s*[:.]\s*(.+)$/i;

export function parseFinding(line: string): Finding | null {
  const match = FINDING_PATTERN.exec(line.trim());
  if (!match) return null;

  const [, id, rawSeverity, text] = match;
  const severity = (rawSeverity ?? '').toLowerCase();

  return {
    id: id ?? '',
    severity: severity === 'medium' ? 'medium' : severity === 'low' ? 'low' : 'high',
    text: text ?? '',
  };
}

export function formatBytes(bytes = 0): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return 'local';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let unit = 0;

  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }

  const rounded = value >= 10 || unit === 0 ? Math.round(value).toString() : value.toFixed(1);
  return `${rounded} ${units[unit]}`;
}

export function formatDate(value?: string): string {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function formatAction(action = ''): string {
  return action
    .toLowerCase()
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function displayTitle(value = ''): string {
  const normalized = value.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  return normalized && normalized === normalized.toLowerCase()
    ? normalized.replace(/\b\w/g, (letter) => letter.toUpperCase())
    : normalized;
}

export function fileType(document: { type?: string; filename?: string }): string {
  return (document.type || document.filename?.split('.').pop() || 'TXT').toUpperCase();
}

export function routeForPrompt(prompt: string): string {
  if (/drawing|diagram|image|scan|p&id/i.test(prompt)) return 'Visual inspection';
  if (/code|script|function|bug/i.test(prompt)) return 'Code analysis';
  if (/approval|draft|memo|note/i.test(prompt)) return 'Controlled drafting';
  return 'Document risk analysis';
}

export function parseAnswer(value = ''): AnswerBlock[] {
  const blocks: AnswerBlock[] = [];
  let listItems: string[] = [];

  const flushList = () => {
    if (!listItems.length) return;

    // A list of review findings carries severity, so it is rendered as a
    // severity-encoded block rather than as plain bullets.
    const findings = listItems.map(parseFinding);
    if (findings.every((finding): finding is Finding => finding !== null)) {
      blocks.push({ id: `findings-${blocks.length}`, kind: 'findings', findings });
    } else {
      blocks.push({ id: `list-${blocks.length}`, kind: 'list', items: listItems });
    }

    listItems = [];
  };

  value.split(/\r?\n/).forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed) {
      flushList();
      return;
    }

    if (trimmed.startsWith('### ')) {
      flushList();
      blocks.push({ id: `heading-${blocks.length}`, kind: 'heading', text: trimmed.slice(4) });
      return;
    }

    if (/^[-•]\s+/.test(trimmed)) {
      listItems.push(trimmed.replace(/^[-•]\s+/, ''));
      return;
    }

    flushList();
    blocks.push({ id: `paragraph-${blocks.length}`, kind: 'paragraph', text: trimmed });
  });

  flushList();
  return blocks;
}

export function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export function demoAnswer(prompt: string, modelId = DEFAULT_MODEL_ID): ChatResponse {
  const lowered = prompt.toLowerCase();
  const model = modelById(modelId);
  const route = model.id === DEFAULT_MODEL_ID ? routeForPrompt(prompt) : model.route;
  const citations = [
    { document: 'P-4107 Safety Review', location: 'section 2' },
    { document: 'P-4107 Safety Review', location: 'section 3' },
  ];
  const base = {
    model: model.id,
    elapsed_ms: 790,
    mode: 'browser-demo' as EngineMode,
    egress_bytes: 0,
    citations,
  };

  if (/action|unresolved|owner|todo|open/.test(lowered)) {
    return {
      ...base,
      route,
      answer:
        '### Unresolved action items\n' +
        '- F-01 HIGH: Complete witnessed ESD-4107 interlock testing. Owner: Instrumentation. Due: before commissioning.\n' +
        '- F-02 HIGH: Renew PSV-4107B certification. Owner: Inspection. Due: before commissioning.\n' +
        '- F-03 MEDIUM: Correct suspected coupling misalignment and repeat vibration baseline. Owner: Rotating Equipment. Due: within 48 hours.\n\n' +
        '**Next checkpoint:** Process Safety should verify F-01 and F-02 before startup is reconsidered.',
    };
  }

  if (/approval|draft|memo|note/.test(lowered)) {
    return {
      ...base,
      route,
      answer:
        '### Draft approval note\n' +
        'Startup approval for P-4107 should remain conditional because two high-priority safeguards are still open.\n' +
        '- Require witnessed closure of ESD-4107 interlock testing.\n' +
        '- Require renewed PSV-4107B certification.\n' +
        '- Permit vibration closure after alignment correction and repeat baseline testing.\n\n' +
        '**Decision:** Hold startup until Process Safety signs F-01 and F-02.',
    };
  }

  return {
    ...base,
    route,
    answer:
      '### Critical findings\n' +
      'The review identifies **three high-priority or time-bound risks** requiring action before commissioning.\n' +
      '- F-01 HIGH: Emergency shutdown interlock ESD-4107 testing is incomplete. Owner: Instrumentation. Due: before commissioning.\n' +
      '- F-02 HIGH: Pressure relief valve PSV-4107B certification is overdue. Owner: Inspection. Due: before commissioning.\n' +
      '- F-03 MEDIUM: Elevated drive-end vibration may indicate coupling misalignment. Owner: Rotating Equipment. Due: within 48 hours.\n\n' +
      '**Recommended action:** Hold startup authorization until Process Safety verifies the two high-priority safeguards.',
  };
}
