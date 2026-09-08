import { describe, expect, it } from 'vitest';
import { displayTitle, formatBytes, parseAnswer, routeForPrompt } from './format';

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
