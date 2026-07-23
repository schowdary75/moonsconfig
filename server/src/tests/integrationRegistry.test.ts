import { describe, expect, it, vi } from 'vitest';

import { createIntegrationRegistry, type IntegrationAdapter } from '../integrations/registry.js';

function createAdapter(name: string): IntegrationAdapter {
  return {
    name,
    sync: vi.fn().mockResolvedValue({ processed: 0 }),
  };
}

describe('integration registry', () => {
  it('starts empty', () => {
    expect(createIntegrationRegistry().list()).toEqual([]);
  });

  it('lists one registered adapter', () => {
    const registry = createIntegrationRegistry();
    const adapter = createAdapter('calendar');

    registry.register(adapter);

    expect(registry.list()).toEqual([adapter]);
  });

  it('preserves registration order', () => {
    const registry = createIntegrationRegistry();
    const calendar = createAdapter('calendar');
    const payments = createAdapter('payments');

    registry.register(calendar);
    registry.register(payments);

    expect(registry.list()).toEqual([calendar, payments]);
  });

  it('replaces an adapter registered with the same name', () => {
    const registry = createIntegrationRegistry();
    const original = createAdapter('calendar');
    const replacement = createAdapter('calendar');

    registry.register(original);
    registry.register(replacement);

    expect(registry.list()).toEqual([replacement]);
  });

  it('keeps registry instances isolated', () => {
    const firstRegistry = createIntegrationRegistry();
    const secondRegistry = createIntegrationRegistry();
    const adapter = createAdapter('calendar');

    firstRegistry.register(adapter);

    expect(firstRegistry.list()).toEqual([adapter]);
    expect(secondRegistry.list()).toEqual([]);
  });
});
