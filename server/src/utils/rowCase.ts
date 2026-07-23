const snakeCase = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const camelCase = (value: string) =>
  value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());

/**
 * Prisma models use snake_case columns while the legacy operation contracts
 * (and the SPA) speak camelCase. These mappers keep the wire format identical
 * while the handlers use Prisma directly.
 */
export function toSnakeData<T extends Record<string, unknown>>(value: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [snakeCase(key), item]));
}

export function camelCaseRow<T extends Record<string, unknown>>(row: T): Record<string, unknown> {
  return Object.fromEntries(Object.entries(row).map(([key, value]) => [camelCase(key), value]));
}

export function camelCaseRows<T extends Record<string, unknown>>(
  rows: T[],
): Record<string, unknown>[] {
  return rows.map((row) => camelCaseRow(row));
}
