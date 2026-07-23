import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { defineOperation } from '../operations/defineOperation.js';

describe('defineOperation', () => {
  it('validates operation data with a Zod schema', async () => {
    const operation = defineOperation({ method: 'POST' })
      .validator(z.object({ count: z.coerce.number() }))
      .handler(({ data }) => data);

    await expect(operation({ data: { count: '4' } })).resolves.toEqual({ count: 4 });
  });

  it('supports migrated function validators', async () => {
    const operation = defineOperation({ method: 'POST' })
      .inputValidator((data) => ({ ...(data as object), normalized: true }))
      .handler(({ data }) => data);

    await expect(operation({ data: { name: 'MooNsConfig' } })).resolves.toEqual({
      name: 'MooNsConfig',
      normalized: true,
    });
  });
});
