import { describe, expect, it } from 'vitest';
import { getErrorMessage } from './errors';

describe('getErrorMessage', () => {
  it('returns an Error message', () => {
    expect(getErrorMessage(new Error('Request failed'))).toBe('Request failed');
  });

  it('uses a safe fallback for unknown values', () => {
    expect(getErrorMessage(null)).toBe('Unexpected error');
  });
});
