import { beforeEach, describe, expect, it, vi } from 'vitest';

const findMany = vi.fn();
vi.mock('../config/prisma.js', () => ({
  prisma: { global_seo_settings: { findMany } },
}));

const { legacyTable, prismaQueryRepository } =
  await import('../repositories/prismaQueryRepository.js');

describe('temporary Prisma operation compatibility repository', () => {
  beforeEach(() => findMany.mockReset());

  it('uses a generated Prisma model delegate without constructing SQL', async () => {
    findMany.mockResolvedValueOnce([{ setting_key: 'title', setting_value: 'MooN' }]);
    const rows = await prismaQueryRepository.select().from(legacyTable('global_seo_settings'));

    expect(findMany).toHaveBeenCalledWith({
      where: undefined,
      select: undefined,
      orderBy: undefined,
      take: undefined,
    });
    expect(rows).toEqual([{ settingKey: 'title', settingValue: 'MooN' }]);
  });

  it('supports Promise-style catch handlers', async () => {
    findMany.mockRejectedValueOnce(new Error('Table is unavailable'));
    const rows = await prismaQueryRepository
      .select()
      .from(legacyTable('global_seo_settings'))
      .catch(() => []);
    expect(rows).toEqual([]);
  });
});
