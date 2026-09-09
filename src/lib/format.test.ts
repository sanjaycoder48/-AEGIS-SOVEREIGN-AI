import { describe, expect, it } from 'vitest';
import { displayTitle, formatBytes, parseAnswer, parseFinding, routeForPrompt } from './format';

describe('format utilities', () => {
  it('formats compact file sizes', () => {
    expect(formatBytes(1103)).toBe('1.1 KB');
    expect(formatBytes(0)).toBe('local');
  });

  it('normalizes uploaded titles without damaging mixed-case ids', () => {
    expect(displayTitle('compressor_safety_review')).toBe('Compressor Safety Review');
    expect(displayTitle('P-4107 Compressor Safety Review')).toBe('P-4107 Compressor Safety Review');
  });

  it('routes prompts to the expected agent lane', () => {
    expect(routeForPrompt('draft an approval note')).toBe('Controlled drafting');
    expect(routeForPrompt('inspect this p&id diagram')).toBe('Visual inspection');
    expect(routeForPrompt('find code bug')).toBe('Code analysis');
  });

  it('parses answer headings, paragraphs and lists', () => {
    const blocks = parseAnswer('### Heading\nIntro\n- one\n- two');
    expect(blocks.map((block) => block.kind)).toEqual(['heading', 'paragraph', 'list']);
  });
});

describe('review findings', () => {
  it('reads the id, severity and text out of a finding line', () => {
    expect(parseFinding('F-02 HIGH: Relief valve certification expired.')).toEqual({
      id: 'F-02',
      severity: 'high',
      text: 'Relief valve certification expired.',
    });
  });

  it('maps each severity word, treating CRITICAL as high', () => {
    expect(parseFinding('F-01 MEDIUM: Vibration elevated.')?.severity).toBe('medium');
    expect(parseFinding('F-03 low: Label missing.')?.severity).toBe('low');
    expect(parseFinding('F-04 CRITICAL: Interlock bypassed.')?.severity).toBe('high');
  });

  it('ignores lines that are not findings', () => {
    expect(parseFinding('Hold startup until Process Safety signs off.')).toBeNull();
  });

  it('renders a severity-encoded block when every bullet is a finding', () => {
    const blocks = parseAnswer(
      '- F-01 HIGH: Interlock test incomplete.\n- F-03 MEDIUM: Vibration elevated.',
    );

    expect(blocks.map((block) => block.kind)).toEqual(['findings']);
    expect(blocks[0]?.findings?.map((finding) => finding.severity)).toEqual(['high', 'medium']);
  });

  it('falls back to a plain list when the bullets are mixed', () => {
    const blocks = parseAnswer('- F-01 HIGH: Interlock test incomplete.\n- Renew the permit.');
    expect(blocks.map((block) => block.kind)).toEqual(['list']);
  });
});
