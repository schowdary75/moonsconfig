import { prisma } from '../config/prisma.js';

export interface LegacyColumn {
  table: LegacyTable;
  name: string;
}
export interface LegacyTable {
  tableName: string;
  [key: string]: unknown;
}
export type LegacyExpression =
  | { kind: 'equals'; field: string; value: unknown }
  | { kind: 'in'; field: string; values: unknown[] };

const snakeCase = (value: string) => value.replace(/([a-z0-9])([A-Z])/g, '$1_$2').toLowerCase();
const camelCase = (value: string) =>
  value.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
const delegate = (table: LegacyTable) => {
  const model = (prisma as unknown as Record<string, any>)[table.tableName];
  if (!model) throw new Error(`Unknown Prisma model: ${table.tableName}`);
  return model;
};
const toPrismaData = (value: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(value).map(([key, item]) => [snakeCase(key), item]));
const mapRow = (row: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(row).map(([key, value]) => [camelCase(key), value]));
const whereOf = (expression?: LegacyExpression) => {
  if (!expression) return undefined;
  return expression.kind === 'equals'
    ? { [expression.field]: expression.value }
    : { [expression.field]: { in: expression.values } };
};

export function legacyTable(tableName: string): LegacyTable {
  const base = { tableName } as LegacyTable;
  return new Proxy(base, {
    get(target, property) {
      if (property in target) return target[property as keyof LegacyTable];
      if (typeof property !== 'string') return undefined;
      return { table: target, name: snakeCase(property) } satisfies LegacyColumn;
    },
  });
}
export function eq(column: LegacyColumn, value: unknown): LegacyExpression {
  return { kind: 'equals', field: column.name, value };
}
export function inArray(column: LegacyColumn, values: unknown[]): LegacyExpression {
  return { kind: 'in', field: column.name, values };
}

class SelectBuilder implements PromiseLike<any[]> {
  private table?: LegacyTable;
  private expression?: LegacyExpression;
  private order?: LegacyColumn;
  private limitValue?: number;
  constructor(private readonly fields?: Record<string, LegacyColumn>) {}
  from(table: LegacyTable) {
    this.table = table;
    return this;
  }
  where(expression: LegacyExpression) {
    this.expression = expression;
    return this;
  }
  orderBy(column: LegacyColumn) {
    this.order = column;
    return this;
  }
  limit(value: number) {
    this.limitValue = value;
    return this;
  }
  async execute() {
    if (!this.table) throw new Error('A table is required');
    const select = this.fields
      ? Object.fromEntries(Object.values(this.fields).map((column) => [column.name, true]))
      : undefined;
    const rows = await delegate(this.table).findMany({
      where: whereOf(this.expression),
      select,
      orderBy: this.order ? { [this.order.name]: 'asc' } : undefined,
      take: this.limitValue,
    });
    if (!this.fields) return rows.map(mapRow);
    return rows.map((row: Record<string, unknown>) =>
      Object.fromEntries(
        Object.entries(this.fields!).map(([alias, column]) => [alias, row[column.name]]),
      ),
    );
  }
  then<TResult1 = any[], TResult2 = never>(
    onfulfilled?: ((value: any[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
  catch<TResult = never>(
    onrejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null,
  ) {
    return this.execute().catch(onrejected);
  }
}

class InsertBuilder implements PromiseLike<any[]> {
  private rows: Record<string, unknown>[] = [];
  constructor(private readonly table: LegacyTable) {}
  values(value: Record<string, unknown> | Record<string, unknown>[]) {
    this.rows = Array.isArray(value) ? value : [value];
    return this;
  }
  async execute() {
    if (!this.rows.length) return [];
    if (this.rows.length === 1) {
      const created = await delegate(this.table).create({ data: toPrismaData(this.rows[0]!) });
      return [{ insertId: Number(created.id ?? 0), affectedRows: 1 }];
    }
    const result = await delegate(this.table).createMany({
      data: this.rows.map(toPrismaData),
      skipDuplicates: true,
    });
    return [{ insertId: 0, affectedRows: result.count }];
  }
  then<TResult1 = any[], TResult2 = never>(
    onfulfilled?: ((value: any[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

class MutationBuilder implements PromiseLike<any[]> {
  private valuesMap: Record<string, unknown> = {};
  private expression?: LegacyExpression;
  constructor(
    private readonly table: LegacyTable,
    private readonly kind: 'update' | 'delete',
  ) {}
  set(values: Record<string, unknown>) {
    this.valuesMap = values;
    return this;
  }
  where(expression: LegacyExpression) {
    this.expression = expression;
    return this;
  }
  async execute() {
    const model = delegate(this.table);
    const where = whereOf(this.expression) ?? {};
    const result =
      this.kind === 'update'
        ? await model.updateMany({ where, data: toPrismaData(this.valuesMap) })
        : await model.deleteMany({ where });
    return [{ affectedRows: result.count, insertId: 0 }];
  }
  then<TResult1 = any[], TResult2 = never>(
    onfulfilled?: ((value: any[]) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ) {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export const prismaQueryRepository = {
  select: (fields?: Record<string, LegacyColumn>) => new SelectBuilder(fields),
  insert: (table: LegacyTable) => new InsertBuilder(table),
  update: (table: LegacyTable) => new MutationBuilder(table, 'update'),
  delete: (table: LegacyTable) => new MutationBuilder(table, 'delete'),
};
