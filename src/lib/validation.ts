import { ALLOWED_EXTENSIONS, MAX_UPLOAD_BYTES } from './constants';

export interface UploadCandidate {
  name: string;
  size: number;
}

export type UploadValidation =
  | { ok: true; extension: string }
  | { ok: false; message: string };

export function validateUploadFile(file: UploadCandidate): UploadValidation {
  const extension = file.name.split('.').pop()?.toLowerCase() || '';

  if (!ALLOWED_EXTENSIONS.includes(extension as (typeof ALLOWED_EXTENSIONS)[number])) {
    return { ok: false, message: 'Use a PDF, TXT, MD or CSV file' };
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return { ok: false, message: 'Prototype limit is 20 MB' };
  }

  return { ok: true, extension };
}
