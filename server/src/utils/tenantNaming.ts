const MAX_SLUG_LENGTH = 48;

export function normalizeTenantSlug(value: string) {
  const normalized = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-+$/g, '');
  if (!normalized || normalized.length < 2)
    throw new Error('Company slug must contain at least two letters or numbers');
  return normalized;
}

export function tenantDatabaseIdentifiers(companyName: string, tenantId: string) {
  const company = normalizeTenantSlug(companyName).replace(/-/g, '_').slice(0, 40);
  const suffix = tenantId.replace(/-/g, '').slice(0, 8).toLowerCase();
  const databaseName = `moonsconfig_${company}_${suffix}`.slice(0, 64);
  const databaseUsername = `moon_${suffix}`;
  if (!/^[a-z0-9_]+$/.test(databaseName) || !/^[a-z0-9_]+$/.test(databaseUsername)) {
    throw new Error('Unsafe tenant database identifier');
  }
  return { databaseName, databaseUsername };
}
