import type { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../config/prisma.js';

type SqlClient = PrismaClient | Prisma.TransactionClient;

export interface QueryResultHeader {
  affectedRows: number;
  insertId: number;
}

function isReadStatement(sql: string) {
  return /^(?:\s|\/\*[\s\S]*?\*\/)*(?:SELECT|SHOW|DESCRIBE|EXPLAIN|WITH)\b/i.test(sql);
}

function isSchemaStatement(sql: string) {
  return /^(?:\s|\/\*[\s\S]*?\*\/)*(?:CREATE|ALTER|DROP|TRUNCATE|RENAME)\b/i.test(sql);
}

export interface MysqlSchemaAddition {
  kind: 'column' | 'index';
  table: string;
  name: string;
}

export function parseMysqlSchemaAddition(sql: string): MysqlSchemaAddition | null {
  const table = sql.match(/^\s*ALTER\s+TABLE\s+`?([A-Za-z0-9_]+)`?/i)?.[1];
  if (!table) return null;
  const index = sql.match(/\bADD\s+(?:UNIQUE\s+)?(?:INDEX|KEY)\s+`?([A-Za-z0-9_]+)`?/i)?.[1];
  if (index) return { kind: 'index', table, name: index };
  const column = sql.match(/\bADD\s+COLUMN\s+`?([A-Za-z0-9_]+)`?/i)?.[1];
  return column ? { kind: 'column', table, name: column } : null;
}

async function schemaAdditionExists(client: SqlClient, sql: string) {
  const addition = parseMysqlSchemaAddition(sql);
  if (!addition) return false;
  const source = addition.kind === 'column' ? 'COLUMNS' : 'STATISTICS';
  const nameField = addition.kind === 'column' ? 'COLUMN_NAME' : 'INDEX_NAME';
  const rows = await client.$queryRawUnsafe<unknown[]>(
    `SELECT 1 FROM information_schema.${source}
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND ${nameField} = ? LIMIT 1`,
    addition.table,
    addition.name,
  );
  return rows.length > 0;
}

export function expandMysqlPlaceholders(sql: string, params: unknown[]) {
  let parameterIndex = 0;
  const values: unknown[] = [];
  const statement = sql.replace(/\?/g, () => {
    if (parameterIndex >= params.length) throw new Error('Missing SQL parameter');
    const value = params[parameterIndex++];
    if (!Array.isArray(value)) {
      values.push(value);
      return '?';
    }
    if (value.length === 0) return 'NULL';
    if (value.every(Array.isArray)) {
      return value
        .map((row) => {
          const columns = row as unknown[];
          values.push(...columns);
          return `(${columns.map(() => '?').join(', ')})`;
        })
        .join(', ');
    }
    values.push(...value);
    return value.map(() => '?').join(', ');
  });
  if (parameterIndex !== params.length) throw new Error('Too many SQL parameters');
  return { statement, values };
}

// Idempotent schema statements (CREATE TABLE IF NOT EXISTS, ALTER TABLE ADD
// column/index) are issued by legacy handlers on every request. Cache each one
// per process so repeated calls skip the round-trip entirely — MySQL DDL
// implicitly commits, so a later transaction rollback cannot invalidate this.
const completedDdl = new Set<string>();

function ddlCacheKey(statement: string, addition: MysqlSchemaAddition | null): string | null {
  if (addition) return `${addition.table}:${addition.kind}:${addition.name}`;
  if (/^\s*CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\b/i.test(statement)) {
    return statement.replace(/\s+/g, ' ').trim();
  }
  return null;
}

async function queryWithClient(client: SqlClient, sql: string, params: unknown[] = []) {
  const expanded = expandMysqlPlaceholders(sql, params);
  // The complete schema is managed by Prisma migrations. Legacy handlers used
  // idempotent request-time DDL as a historical bootstrap mechanism; accepting
  // those calls as no-ops prevents application traffic from mutating schema
  // while the handlers are replaced domain by domain.
  if (isSchemaStatement(expanded.statement)) {
    return [{ affectedRows: 0, insertId: 0 } satisfies QueryResultHeader, []] as const;
  }
  if (isReadStatement(expanded.statement)) {
    const rows = await client.$queryRawUnsafe<unknown[]>(expanded.statement, ...expanded.values);
    return [rows, []] as const;
  }
  const addition = parseMysqlSchemaAddition(expanded.statement);
  const ddlKey = ddlCacheKey(expanded.statement, addition);
  if (ddlKey && completedDdl.has(ddlKey)) {
    return [{ affectedRows: 0, insertId: 0 } satisfies QueryResultHeader, []] as const;
  }
  if (addition && (await schemaAdditionExists(client, expanded.statement))) {
    completedDdl.add(ddlKey!);
    return [{ affectedRows: 0, insertId: 0 } satisfies QueryResultHeader, []] as const;
  }
  const affectedRows = await client.$executeRawUnsafe(expanded.statement, ...expanded.values);
  if (ddlKey) completedDdl.add(ddlKey);
  return [{ affectedRows, insertId: 0 } satisfies QueryResultHeader, []] as const;
}

async function queryWithInsertId(sql: string, params: unknown[] = []) {
  const expanded = expandMysqlPlaceholders(sql, params);
  return prisma.$transaction(async (transaction) => {
    const affectedRows = await transaction.$executeRawUnsafe(
      expanded.statement,
      ...expanded.values,
    );
    const rows = await transaction.$queryRawUnsafe<Array<{ insertId: bigint | number }>>(
      'SELECT LAST_INSERT_ID() AS insertId',
    );
    return [
      { affectedRows, insertId: Number(rows[0]?.insertId ?? 0) } satisfies QueryResultHeader,
      [],
    ] as const;
  });
}

export function createSqlConnection() {
  let transactionClient: Prisma.TransactionClient | undefined;
  let finish: ((action: 'commit' | 'rollback') => void) | undefined;
  let transactionPromise: Promise<void> | undefined;

  return {
    async beginTransaction() {
      if (transactionPromise) return;
      let ready!: (client: Prisma.TransactionClient) => void;
      const readyPromise = new Promise<Prisma.TransactionClient>((resolve) => (ready = resolve));
      const finishPromise = new Promise<'commit' | 'rollback'>((resolve) => (finish = resolve));
      transactionPromise = prisma
        .$transaction(async (transaction) => {
          transactionClient = transaction;
          ready(transaction);
          const action = await finishPromise;
          if (action === 'rollback') throw new Error('__ROLLBACK__');
        })
        .catch((error: unknown) => {
          if (!(error instanceof Error) || error.message !== '__ROLLBACK__') throw error;
        });
      await readyPromise;
    },
    async query(sql: string, params: unknown[] = []) {
      if (transactionClient) return queryWithClient(transactionClient, sql, params);
      if (/^(?:\s|\/\*[\s\S]*?\*\/)*INSERT\b/i.test(sql)) return queryWithInsertId(sql, params);
      return queryWithClient(prisma, sql, params);
    },
    async execute(sql: string, params: unknown[] = []) {
      return this.query(sql, params);
    },
    async commit() {
      finish?.('commit');
      await transactionPromise;
      transactionClient = undefined;
      transactionPromise = undefined;
      finish = undefined;
    },
    async rollback() {
      finish?.('rollback');
      await transactionPromise;
      transactionClient = undefined;
      transactionPromise = undefined;
      finish = undefined;
    },
    release() {},
  };
}

export const sqlRepository = {
  async query(sql: string, params: unknown[] = []) {
    if (/^(?:\s|\/\*[\s\S]*?\*\/)*INSERT\b/i.test(sql)) return queryWithInsertId(sql, params);
    return queryWithClient(prisma, sql, params);
  },
  async execute(sql: string, params: unknown[] = []) {
    return this.query(sql, params);
  },
  async getConnection() {
    return createSqlConnection();
  },
};
