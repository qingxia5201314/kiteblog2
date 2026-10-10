import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteDatabase } from '../sqliteDatabase.mjs';
import { createUserStore } from '../userStore.mjs';
import { runAdminAuthMigration } from './adminAuthMigration.mjs';

const MIGRATION_NAME = '2026-07-15-admin-auth-cookie';
const MIGRATION_TIME = new Date('2026-07-15T04:05:06.789Z');

let database;
let databases;
let dbPath;
let tempDir;

function queryOne(sql, params = [], source = database) {
  const statement = source.db.prepare(sql);
  try {
    statement.bind(params);
    return statement.step() ? statement.getAsObject() : undefined;
  } finally {
    statement.free();
  }
}

function insertUser({ id, permission }) {
  const time = '2026-07-15T00:00:00.000Z';
  database.db.run(
    `INSERT INTO users (id, username, password_hash, nickname, role, permission, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, id, 'unused-hash', id, permission, permission, time, time],
  );
}

function seedLegacyAuthState() {
  database.db.run(`
    INSERT INTO user_sessions (token_hash, user_id, created_at, expires_at)
    VALUES ('user-session', 'admin-1', '2026-07-15T00:00:00.000Z', '2026-08-15T00:00:00.000Z');
    CREATE TABLE admin_sessions (token TEXT PRIMARY KEY);
    INSERT INTO admin_sessions (token) VALUES ('legacy-admin');
    CREATE TABLE accounting_sessions (token TEXT PRIMARY KEY);
    INSERT INTO accounting_sessions (token) VALUES ('legacy-accounting');
  `);
  database.persist();
}

function tableType(name, source = database) {
  return queryOne('SELECT type FROM sqlite_master WHERE name = ?', [name], source)?.type;
}

async function reopenDatabase() {
  database.db.close();
  databases = databases.filter((openedDatabase) => openedDatabase !== database);
  database = await createSqliteDatabase({ dbPath });
  databases.push(database);
}

function expectLegacyAuthState() {
  expect(queryOne('SELECT COUNT(*) AS count FROM user_sessions').count).toBe(1);
  expect(queryOne('SELECT token FROM admin_sessions')).toEqual({ token: 'legacy-admin' });
  expect(queryOne('SELECT token FROM accounting_sessions')).toEqual({ token: 'legacy-accounting' });
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-admin-auth-migration-'));
  dbPath = join(tempDir, 'blog.sqlite');
  databases = [];
  database = await createSqliteDatabase({ dbPath });
  databases.push(database);
  createUserStore({ database });
});

afterEach(async () => {
  for (const openedDatabase of databases) openedDatabase.db.close();
  await rm(tempDir, { force: true, recursive: true });
});

describe('admin auth migration', () => {
  it('exports the migration runner', () => {
    expect(runAdminAuthMigration).toBeTypeOf('function');
  });

  it('clears all sessions, drops legacy tables, and persists its migration record', async () => {
    insertUser({ id: 'admin-1', permission: 'admin' });
    seedLegacyAuthState();

    const result = runAdminAuthMigration({
      database,
      now: () => new Date(MIGRATION_TIME),
      requireSingleAdmin: true,
    });

    expect(result).toEqual({ applied: true, adminCount: 1 });
    expect(queryOne('SELECT COUNT(*) AS count FROM user_sessions').count).toBe(0);
    expect(tableType('admin_sessions')).toBeUndefined();
    expect(tableType('accounting_sessions')).toBeUndefined();
    expect(queryOne('SELECT applied_at FROM schema_migrations WHERE name = ?', [MIGRATION_NAME])).toEqual({
      applied_at: MIGRATION_TIME.toISOString(),
    });

    const reopenedDatabase = await createSqliteDatabase({ dbPath });
    databases.push(reopenedDatabase);
    expect(queryOne('SELECT applied_at FROM schema_migrations WHERE name = ?', [MIGRATION_NAME], reopenedDatabase)).toEqual(
      { applied_at: MIGRATION_TIME.toISOString() },
    );
    expect(tableType('admin_sessions', reopenedDatabase)).toBeUndefined();
    expect(tableType('accounting_sessions', reopenedDatabase)).toBeUndefined();
  });

  it('fails closed when a legacy auth table reappears after the migration is recorded', () => {
    insertUser({ id: 'admin-1', permission: 'admin' });
    seedLegacyAuthState();
    runAdminAuthMigration({ database, now: () => new Date(MIGRATION_TIME), requireSingleAdmin: true });

    insertUser({ id: 'admin-2', permission: 'admin' });
    seedLegacyAuthState();

    expect(() => runAdminAuthMigration({ database, requireSingleAdmin: true })).toThrow(
      'Legacy auth tables detected after the admin auth migration',
    );
    expect(queryOne('SELECT COUNT(*) AS count FROM user_sessions').count).toBe(1);
    expect(queryOne('SELECT token FROM admin_sessions')).toEqual({ token: 'legacy-admin' });
    expect(queryOne('SELECT token FROM accounting_sessions')).toEqual({ token: 'legacy-accounting' });
  });

  it.each([0, 2])(
    'requires exactly one admin when strict validation finds %i',
    async (adminCount) => {
      for (let index = 1; index <= adminCount; index += 1) {
        insertUser({ id: `admin-${index}`, permission: 'admin' });
      }
      seedLegacyAuthState();

      expect(() => runAdminAuthMigration({ database, requireSingleAdmin: true })).toThrow(
        `Admin auth migration requires exactly one admin; found ${adminCount}`,
      );
      expectLegacyAuthState();
      expect(tableType('schema_migrations')).toBeUndefined();

      database.persist();
      await reopenDatabase();

      expectLegacyAuthState();
      expect(tableType('schema_migrations')).toBeUndefined();
    },
  );

  it('allows local and test databases with no admin by default', () => {
    seedLegacyAuthState();

    expect(runAdminAuthMigration({ database, now: () => new Date(MIGRATION_TIME) })).toEqual({
      applied: true,
      adminCount: 0,
    });
    expect(queryOne('SELECT COUNT(*) AS count FROM user_sessions').count).toBe(0);
    expect(tableType('admin_sessions')).toBeUndefined();
    expect(tableType('accounting_sessions')).toBeUndefined();
    expect(queryOne('SELECT name FROM schema_migrations WHERE name = ?', [MIGRATION_NAME])).toEqual({
      name: MIGRATION_NAME,
    });
  });

  it('rolls back all destructive changes when recording the migration fails', async () => {
    insertUser({ id: 'admin-1', permission: 'admin' });
    seedLegacyAuthState();
    database.db.run(`
      CREATE TABLE schema_migrations (
        name TEXT PRIMARY KEY CHECK (name <> '${MIGRATION_NAME}'),
        applied_at TEXT NOT NULL
      )
    `);
    database.persist();

    expect(() =>
      runAdminAuthMigration({ database, now: () => new Date(MIGRATION_TIME), requireSingleAdmin: true }),
    ).toThrow(/CHECK constraint failed/);

    expectLegacyAuthState();
    expect(queryOne('SELECT name FROM schema_migrations WHERE name = ?', [MIGRATION_NAME])).toBeUndefined();

    await reopenDatabase();

    expectLegacyAuthState();
    expect(tableType('schema_migrations')).toBe('table');
    expect(queryOne('SELECT name FROM schema_migrations WHERE name = ?', [MIGRATION_NAME])).toBeUndefined();
  });
});
