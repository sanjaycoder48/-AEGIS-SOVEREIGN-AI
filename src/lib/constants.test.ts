import { describe, expect, it } from 'vitest';
import { DEFAULT_MODEL_ID, MODEL_CATALOG, modelById } from './constants';

describe('model registry', () => {
  it('keeps a valid default model', () => {
    expect(modelById(DEFAULT_MODEL_ID).id).toBe(DEFAULT_MODEL_ID);
  });

  it('falls back to the default for unknown model ids', () => {
    expect(modelById('unknown-model').id).toBe(DEFAULT_MODEL_ID);
  });

  it('exposes the expected task lanes', () => {
    expect(MODEL_CATALOG.map((model) => model.lane)).toEqual(['Text', 'Vision', 'Code']);
  });
});
