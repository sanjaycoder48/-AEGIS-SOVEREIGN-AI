import type { TraceStep } from '../types';
import { routeForPrompt } from './format';

export function initialTrace(): TraceStep[] {
  return [
    { label: 'Policy gate', title: 'Access verified', detail: 'Engineering L3 - read only', duration: '12 ms', status: 'complete' },
    { label: 'Router', title: 'Ready to classify', detail: 'Task policy online', duration: '31 ms', status: 'complete' },
    { label: 'Retrieval', title: 'Vault on standby', detail: 'Selected sources only', status: 'standby' },
    { label: 'Inference', title: 'Awaiting request', detail: 'Local GPU - no egress', status: 'standby' },
  ];
}

export function runningTrace(question: string, sourceCount: number, route?: string): TraceStep[] {
  return [
    { label: 'Policy gate', title: 'Access verified', detail: 'Engineering L3 - read only', duration: '12 ms', status: 'complete' },
    { label: 'Router', title: route || routeForPrompt(question), detail: 'Task policy matched', duration: '31 ms', status: 'complete' },
    { label: 'Retrieval', title: 'Searching local index', detail: `${sourceCount || 1} source window`, status: 'running' },
    { label: 'Inference', title: 'Queued locally', detail: 'No external API', status: 'standby' },
  ];
}

export function completeTrace(route: string, model: string, citations: number, elapsedMs: number): TraceStep[] {
  return [
    { label: 'Policy gate', title: 'Access verified', detail: 'Engineering L3 - read only', duration: '12 ms', status: 'complete' },
    { label: 'Router', title: route, detail: `${model} selected`, duration: '31 ms', status: 'complete' },
    { label: 'Retrieval', title: `${Math.max(citations, 1)} passages selected`, detail: 'Local evidence vault', duration: '84 ms', status: 'complete' },
    { label: 'Inference', title: 'Response grounded', detail: 'Audit hash recorded', duration: `${elapsedMs} ms`, status: 'complete' },
  ];
}
