import { describe, expect, it } from 'vitest';
import { openapi } from '../docs/openapi.js';
import { operationRepository } from '../repositories/operationRepository.js';

describe('operation parity registry', () => {
  it('registers and documents every migrated operation once', () => {
    const operations = operationRepository.list();
    expect(operations).toHaveLength(355);
    expect(new Set(operations.map((operation) => operation.name))).toHaveLength(operations.length);
    for (const operation of operations) {
      expect(openapi.paths).toHaveProperty(`/operations/${operation.name}`);
    }
  });
});
