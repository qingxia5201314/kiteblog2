import { createHash } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createSqliteDatabase } from './sqliteDatabase.mjs';
import { createUserStore } from './userStore.mjs';

let currentTime;
let database;
let databases;
let dbPath;
let tempDir;
let store;

function queryOne(sql, params = [], source = database) {
  const statement = source.db.prepare(sql);
  try {
    statement.bind(params);
    return statement.step() ? statement.getAsObject() : undefined;
  } finally {
    statement.free();
  }
}

function insertLegacyUser({
  id = 'legacy-user',
  username = 'legacy_user',
  password = 'secret123',
  permission = 'reader',
} = {}) {
  const salt = '0123456789abcdef0123456789abcdef';
  const digest = createHash('sha256').update(`${salt}:${password}`).digest('hex');
  const stored = `${salt}:${digest}`;
  const time = currentTime.toISOString();

  database.db.run(
    `INSERT INTO users (id, username, password_hash, nickname, role, permission, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, username, stored, 'Legacy', permission, permission, time, time],
  );
  database.persist();

  return { id, stored, username };
}

function expectLastAdminError(callback) {
  let caught;
  try {
    callback();
  } catch (error) {
    caught = error;
  }

  expect(caught).toMatchObject({ code: 'LAST_ADMIN', status: 409 });
  return caught;
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-users-'));
  dbPath = join(tempDir, 'blog.sqlite');
  databases = [];
  database = await createSqliteDatabase({ dbPath });
  databases.push(database);
  currentTime = new Date('2026-06-14T00:00:00.000Z');
  store = createUserStore({ database, now: () => new Date(currentTime) });
});

afterEach(async () => {
  for (const openedDatabase of databases) openedDatabase.db.close();
  await rm(tempDir, { force: true, recursive: true });
});

describe('user store', () => {
  it('registers reader users asynchronously with scrypt password hashes', async () => {
    const pending = store.register({
      username: 'kite_user',
      password: 'secret123',
      nickname: 'Kite',
    });

    expect(pending).toBeInstanceOf(Promise);
    const session = await pending;
    const row = queryOne('SELECT password_hash FROM users WHERE id = ?', [session.user.id]);

    expect(session.user).toMatchObject({ permission: 'reader', nickname: 'Kite' });
    expect(row.password_hash).toMatch(/^scrypt\$v1\$/);
  });

  it('atomically registers only one session for concurrent duplicate usernames', async () => {
    const attempts = await Promise.allSettled([
      store.register({ username: 'same_user', password: 'secret123', nickname: 'First' }),
      store.register({ username: 'same_user', password: 'secret123', nickname: 'Second' }),
    ]);
    const fulfilled = attempts.filter((attempt) => attempt.status === 'fulfilled');
    const rejected = attempts.filter((attempt) => attempt.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ message: '用户名已存在' });
    expect(queryOne('SELECT COUNT(*) AS count FROM users WHERE lower(username) = lower(?)', ['same_user']).count).toBe(
      1,
    );
    expect(queryOne('SELECT COUNT(*) AS count FROM user_sessions').count).toBe(1);
  });

  it('creates users asynchronously with scrypt password hashes', async () => {
    const pending = store.createUser({
      username: 'admin_made',
      password: 'secret123',
      nickname: 'Created',
      permission: 'admin',
    });

    expect(pending).toBeInstanceOf(Promise);
    const created = await pending;
    const row = queryOne('SELECT password_hash, role, permission FROM users WHERE id = ?', [created.id]);

    expect(created.permission).toBe('admin');
    expect(row).toMatchObject({ role: 'admin', permission: 'admin' });
    expect(row.password_hash).toMatch(/^scrypt\$v1\$/);
  });

  it('atomically creates only one user for concurrent duplicate usernames', async () => {
    const attempts = await Promise.allSettled([
      store.createUser({ username: 'same_user', password: 'secret123', nickname: 'First', permission: 'reader' }),
      store.createUser({ username: 'same_user', password: 'secret123', nickname: 'Second', permission: 'admin' }),
    ]);
    const fulfilled = attempts.filter((attempt) => attempt.status === 'fulfilled');
    const rejected = attempts.filter((attempt) => attempt.status === 'rejected');

    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ message: '用户名已存在' });
    expect(queryOne('SELECT COUNT(*) AS count FROM users WHERE lower(username) = lower(?)', ['same_user']).count).toBe(
      1,
    );
    expect(queryOne('SELECT COUNT(*) AS count FROM user_sessions').count).toBe(0);
  });

  it('stores only a hash of each raw session token and verifies the raw token', async () => {
    const session = await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    const row = queryOne('SELECT token_hash, expires_at FROM user_sessions WHERE user_id = ?', [session.user.id]);

    expect(Buffer.from(session.token, 'base64url')).toHaveLength(32);
    expect(row.token_hash).toBe(createHash('sha256').update(session.token).digest('hex'));
    expect(row.token_hash).not.toBe(session.token);
    expect(store.verifySession(session.token)).toEqual({ user: session.user, expiresAt: session.expiresAt });
    expect(store.verifySession(`Bearer ${session.token}`)).toBeNull();
  });

  it('uses a 30-day absolute expiry and deletes an expired session', async () => {
    const session = await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });

    expect(session.expiresAt).toBe('2026-07-14T00:00:00.000Z');
    currentTime = new Date('2026-07-13T23:59:59.999Z');
    expect(store.verifySession(session.token)).not.toBeNull();

    currentTime = new Date('2026-07-14T00:00:00.000Z');
    expect(store.verifySession(session.token)).toBeNull();
    expect(queryOne('SELECT token_hash FROM user_sessions WHERE user_id = ?', [session.user.id])).toBeUndefined();
  });

  it('rejects and deletes sessions with malformed expiry timestamps', async () => {
    const session = await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    database.db.run('UPDATE user_sessions SET expires_at = ? WHERE user_id = ?', ['not-a-date', session.user.id]);
    database.persist();

    expect(store.verifySession(session.token)).toBeNull();
    expect(queryOne('SELECT token_hash FROM user_sessions WHERE user_id = ?', [session.user.id])).toBeUndefined();
  });

  it('rejects and deletes orphaned sessions', async () => {
    const session = await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    database.db.run('DELETE FROM users WHERE id = ?', [session.user.id]);
    database.persist();

    expect(store.verifySession(session.token)).toBeNull();
    expect(queryOne('SELECT token_hash FROM user_sessions WHERE user_id = ?', [session.user.id])).toBeUndefined();
  });

  it('revokes the current session or all sessions for one user', async () => {
    const first = await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    const second = await store.login({ username: 'reader01', password: 'secret123' });
    const other = await store.register({ username: 'reader02', password: 'secret123', nickname: 'Other' });

    expect(store.revokeSession(first.token)).toBe(true);
    expect(store.verifySession(first.token)).toBeNull();
    expect(store.verifySession(second.token)).not.toBeNull();

    expect(store.revokeUserSessions(first.user.id)).toBe(true);
    expect(store.verifySession(second.token)).toBeNull();
    expect(store.verifySession(other.token)).not.toBeNull();
  });

  it('uses the same error for missing users and bad passwords', async () => {
    await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });

    await expect(store.login({ username: 'missing', password: 'secret123' })).rejects.toThrow('用户名或密码错误');
    await expect(store.login({ username: 'reader01', password: 'wrong-password' })).rejects.toThrow('用户名或密码错误');
  });

  it('rejects login when the user is deleted while password verification is pending', async () => {
    const created = await store.createUser({
      username: 'reader01',
      password: 'secret123',
      nickname: 'Reader',
      permission: 'reader',
    });

    const pending = store.login({ username: created.username, password: 'secret123' });
    expect(store.removeUser(created.id)).toBe(true);

    await expect(pending).rejects.toThrow('用户名或密码错误');
    expect(queryOne('SELECT token_hash FROM user_sessions WHERE user_id = ?', [created.id])).toBeUndefined();
  });

  it('rehashes a valid legacy password before issuing its session', async () => {
    const legacy = insertLegacyUser();

    const session = await store.login({ username: legacy.username, password: 'secret123' });
    const row = queryOne('SELECT password_hash FROM users WHERE id = ?', [legacy.id]);

    expect(row.password_hash).toMatch(/^scrypt\$v1\$/);
    expect(row.password_hash).not.toBe(legacy.stored);
    expect(store.verifySession(session.token)?.user.id).toBe(legacy.id);
  });

  it('persists a legacy password upgrade and its session for a reopened database', async () => {
    const legacy = insertLegacyUser();
    const session = await store.login({ username: legacy.username, password: 'secret123' });

    const reopenedDatabase = await createSqliteDatabase({ dbPath });
    databases.push(reopenedDatabase);
    const reopenedStore = createUserStore({
      database: reopenedDatabase,
      now: () => new Date(currentTime),
    });
    const reopenedUser = queryOne('SELECT password_hash FROM users WHERE id = ?', [legacy.id], reopenedDatabase);

    expect(reopenedUser.password_hash).toMatch(/^scrypt\$v1\$/);
    expect(reopenedStore.verifySession(session.token)).toEqual({ user: session.user, expiresAt: session.expiresAt });
  });

  it('does not rehash a legacy password after a failed login', async () => {
    const legacy = insertLegacyUser();

    await expect(store.login({ username: legacy.username, password: 'wrong-password' })).rejects.toThrow(
      '用户名或密码错误',
    );

    expect(queryOne('SELECT password_hash FROM users WHERE id = ?', [legacy.id]).password_hash).toBe(legacy.stored);
    expect(queryOne('SELECT token_hash FROM user_sessions WHERE user_id = ?', [legacy.id])).toBeUndefined();
  });

  it('keeps sessions valid when only the nickname changes', async () => {
    const session = await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });

    const updated = store.updateUser(session.user.id, { nickname: '新昵称' });

    expect(updated.nickname).toBe('新昵称');
    expect(store.verifySession(session.token)?.user.nickname).toBe('新昵称');
  });

  it('revokes sessions whenever permission actually changes and keeps role synchronized', async () => {
    const session = await store.register({ username: 'reader01', password: 'secret123', nickname: 'Reader' });
    await store.createUser({ username: 'admin02', password: 'secret123', nickname: 'Admin', permission: 'admin' });

    const promoted = store.updateUser(session.user.id, { permission: 'admin' });
    expect(promoted.permission).toBe('admin');
    expect(store.verifySession(session.token)).toBeNull();
    expect(queryOne('SELECT role, permission FROM users WHERE id = ?', [session.user.id])).toMatchObject({
      role: 'admin',
      permission: 'admin',
    });

    const promotedSession = await store.login({ username: 'reader01', password: 'secret123' });
    const demoted = store.updateUser(session.user.id, { permission: 'reader' });
    expect(demoted.permission).toBe('reader');
    expect(store.verifySession(promotedSession.token)).toBeNull();
  });

  it('does not demote or delete the last admin and preserves its session', async () => {
    const admin = await store.createUser({
      username: 'only_admin',
      password: 'secret123',
      nickname: 'Admin',
      permission: 'admin',
    });
    const session = await store.login({ username: admin.username, password: 'secret123' });

    expectLastAdminError(() => store.updateUser(admin.id, { nickname: 'Changed', permission: 'reader' }));
    expect(store.listUsers()).toContainEqual(admin);
    expect(store.verifySession(session.token)).not.toBeNull();

    expectLastAdminError(() => store.removeUser(admin.id));
    expect(store.listUsers()).toContainEqual(admin);
    expect(store.verifySession(session.token)).not.toBeNull();
  });

  it('allows admin permission changes and deletion while another admin remains', async () => {
    const first = await store.createUser({
      username: 'admin01',
      password: 'secret123',
      nickname: 'First',
      permission: 'admin',
    });
    const second = await store.createUser({
      username: 'admin02',
      password: 'secret123',
      nickname: 'Second',
      permission: 'admin',
    });
    const firstSession = await store.login({ username: first.username, password: 'secret123' });

    expect(store.updateUser(first.id, { permission: 'reader' }).permission).toBe('reader');
    expect(store.verifySession(firstSession.token)).toBeNull();

    store.updateUser(first.id, { permission: 'admin' });
    const secondSession = await store.login({ username: second.username, password: 'secret123' });
    expect(store.removeUser(second.id)).toBe(true);
    expect(store.verifySession(secondSession.token)).toBeNull();
    expect(store.listUsers().map((user) => user.id)).not.toContain(second.id);
  });

  it('preserves validation and returns neutral values for missing records', async () => {
    await expect(store.register({ username: 'x', password: 'secret123', nickname: 'Invalid' })).rejects.toThrow(
      '用户名需为 3-24 位字母、数字或下划线',
    );
    await expect(
      store.createUser({ username: 'reader01', password: 'secret123', nickname: 'Reader', permission: 'owner' }),
    ).rejects.toThrow('Invalid permission');

    expect(store.verifySession('missing-token')).toBeNull();
    expect(store.revokeSession('missing-token')).toBe(false);
    expect(store.revokeUserSessions('missing-user')).toBe(false);
    expect(store.updateUser('missing-user', { nickname: 'Nobody' })).toBeUndefined();
    expect(store.removeUser('missing-user')).toBe(false);
  });
});
