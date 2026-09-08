import { describe, expect, it } from 'vitest';
import { MAX_UPLOAD_BYTES } from './constants';
import { validateUploadFile } from './validation';

describe('validateUploadFile', () => {
  it('accepts supported local evidence files', () => {
    expect(validateUploadFile({ name: 'startup-review.PDF', size: 42 })).toEqual({ ok: true, extension: 'pdf' });
  });

  it('rejects unsupported file types', () => {
    expect(validateUploadFile({ name: 'credentials.exe', size: 42 })).toEqual({
      ok: false,
      message: 'Use a PDF, TXT, MD or CSV file',
    });
  });

  it('rejects files above the prototype upload limit', () => {
    expect(validateUploadFile({ name: 'large.md', size: MAX_UPLOAD_BYTES + 1 })).toEqual({
      ok: false,
      message: 'Prototype limit is 20 MB',
    });
  });
});
