import { describe, expect, it } from 'vitest';

import { jsonReplacer } from '../helpers/json.js';

describe('JSON response serialization', () => {
  it('serializes safe database bigint values as numbers for legacy compatibility', () => {
    expect(JSON.stringify({ count: 46n }, jsonReplacer)).toBe('{"count":46}');
  });

  it('serializes bigint values outside the safe integer range without losing precision', () => {
    expect(JSON.stringify({ id: 9_007_199_254_740_993n }, jsonReplacer)).toBe(
      '{"id":"9007199254740993"}',
    );
  });
});
