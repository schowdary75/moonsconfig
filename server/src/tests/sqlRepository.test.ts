import { describe, expect, it } from 'vitest';
import {
  expandMysqlPlaceholders,
  parseMysqlSchemaAddition,
} from '../repositories/sqlRepository.js';

describe('MySQL compatibility placeholder expansion', () => {
  it('expands an IN-list array', () => {
    expect(
      expandMysqlPlaceholders('SELECT * FROM roles WHERE role IN (?)', [['admin', 'editor']]),
    ).toEqual({
      statement: 'SELECT * FROM roles WHERE role IN (?, ?)',
      values: ['admin', 'editor'],
    });
  });

  it('expands bulk value rows', () => {
    expect(
      expandMysqlPlaceholders('INSERT INTO roles (user_id, role) VALUES ?', [
        [
          [1, 'admin'],
          [2, 'editor'],
        ],
      ]),
    ).toEqual({
      statement: 'INSERT INTO roles (user_id, role) VALUES (?, ?), (?, ?)',
      values: [1, 'admin', 2, 'editor'],
    });
  });

  it('recognizes idempotent column and index additions', () => {
    expect(
      parseMysqlSchemaAddition('ALTER TABLE global_chat_messages ADD COLUMN request_id INT NULL'),
    ).toEqual({ kind: 'column', table: 'global_chat_messages', name: 'request_id' });
    expect(
      parseMysqlSchemaAddition(
        'ALTER TABLE `global_chat_messages` ADD INDEX `idx_request` (request_id)',
      ),
    ).toEqual({ kind: 'index', table: 'global_chat_messages', name: 'idx_request' });
  });
});
