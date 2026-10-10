import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createConnection, createServer } from 'node:net';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import initSqlJs from 'sql.js';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const PROJECT_ROOT = process.cwd();
const START_TIMEOUT_MS = 8_000;

let children;
let tempDir;
const childClosePromises = new WeakMap();

function sha256(data) {
  return createHash('sha256').update(data).digest('hex');
}

async function seedUsersDatabase(dbPath, adminCount) {
  const SQL = await initSqlJs();
  const db = new SQL.Database();
  db.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      nickname TEXT NOT NULL,
      role TEXT NOT NULL,
      permission TEXT NOT NULL DEFAULT 'reader',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `);
  for (let index = 1; index <= adminCount; index += 1) {
    db.run(
      `INSERT INTO users (id, username, password_hash, nickname, role, permission, created_at, updated_at)
       VALUES (?, ?, 'unused-hash', ?, 'admin', 'admin', '2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00.000Z')`,
      [`admin-${index}`, `admin-${index}`, `Admin ${index}`],
    );
  }
  await writeFile(dbPath, Buffer.from(db.export()));
  db.close();
}

async function addAdminUser(dbPath, index) {
  const SQL = await initSqlJs();
  const db = new SQL.Database(await readFile(dbPath));
  db.run(
    `INSERT INTO users (id, username, password_hash, nickname, role, permission, created_at, updated_at)
     VALUES (?, ?, 'unused-hash', ?, 'admin', 'admin', '2026-07-15T00:00:00.000Z', '2026-07-15T00:00:00.000Z')`,
    [`admin-${index}`, `admin-${index}`, `Admin ${index}`],
  );
  await writeFile(dbPath, Buffer.from(db.export()));
  db.close();
}

async function removeAllAdmins(dbPath) {
  const SQL = await initSqlJs();
  const db = new SQL.Database(await readFile(dbPath));
  db.run("DELETE FROM users WHERE permission = 'admin'");
  await writeFile(dbPath, Buffer.from(db.export()));
  db.close();
}

function childEnvironment(dbPath, overrides = {}) {
  const env = {
    ...process.env,
    FORCE_COLOR: '0',
    NODE_ENV: 'production',
    SITE_URL: 'https://blog.example',
    TRUST_PROXY: '0',
    HOST: '127.0.0.1',
    PORT: '0',
    POST_DB_PATH: dbPath,
    UPLOAD_DIR: join(tempDir, 'uploads'),
    IMAGE_DIR: join(tempDir, 'images'),
    ...overrides,
  };
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) delete env[key];
  }
  return env;
}

function spawnServer(env) {
  const child = spawn(process.execPath, ['server/index.mjs'], {
    cwd: PROJECT_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
    windowsHide: true,
  });
  const output = { stderr: '', stdout: '' };
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    output.stdout += chunk;
  });
  child.stderr.on('data', (chunk) => {
    output.stderr += chunk;
  });
  children.add(child);
  const closed = new Promise((resolve) => {
    child.once('close', (code, signal) => {
      children.delete(child);
      resolve({ code, signal });
    });
  });
  childClosePromises.set(child, closed);
  return { child, output };
}

function waitForClose(child, timeoutMs = START_TIMEOUT_MS) {
  const closed = childClosePromises.get(child);
  if (!closed) return Promise.resolve({ code: child.exitCode, signal: child.signalCode });
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`server child did not exit within ${timeoutMs}ms`));
    }, timeoutMs);
    closed.then((result) => {
      clearTimeout(timer);
      resolve(result);
    });
  });
}

function parseListeningPort(output) {
  const match = output.stdout.match(/server listening on http:\/\/127\.0\.0\.1:(\d+)/);
  return match ? Number(match[1]) : undefined;
}

function waitForListening(child, output, timeoutMs = START_TIMEOUT_MS) {
  const currentPort = parseListeningPort(output);
  if (currentPort !== undefined) return Promise.resolve(currentPort);
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => finish(new Error(`server did not listen within ${timeoutMs}ms`)), timeoutMs);
    const onData = () => {
      const port = parseListeningPort(output);
      if (port !== undefined) finish(undefined, port);
    };
    const onClose = () => finish(new Error(`server exited before listening: ${output.stderr}`));
    const finish = (error, port) => {
      clearTimeout(timer);
      child.stdout.off('data', onData);
      child.off('close', onClose);
      if (error) reject(error);
      else resolve(port);
    };
    child.stdout.on('data', onData);
    child.once('close', onClose);
    onData();
  });
}

async function stopChild(child, signal = 'SIGTERM') {
  if (child.exitCode !== null || child.signalCode !== null) return waitForClose(child);
  if (process.platform === 'win32' && child.connected) {
    child.send({ type: 'shutdown', signal });
    try {
      return await waitForClose(child, START_TIMEOUT_MS);
    } catch {
      child.kill('SIGTERM');
      return waitForClose(child);
    }
  }
  child.kill(signal);
  return waitForClose(child);
}

async function reservePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return { port: server.address().port, server };
}

async function openPartialPost(port) {
  const socket = createConnection({ host: '127.0.0.1', port });
  socket.on('error', () => {});
  await new Promise((resolve, reject) => {
    socket.once('connect', resolve);
    socket.once('error', reject);
  });
  const closed = new Promise((resolve) => socket.once('close', () => resolve()));
  socket.write(
    'POST /api/users/login HTTP/1.1\r\n' +
      'Host: 127.0.0.1\r\n' +
      'Origin: https://blog.example\r\n' +
      'Content-Type: application/json\r\n' +
      'Content-Length: 100\r\n' +
      'Connection: keep-alive\r\n\r\n{',
  );
  await new Promise((resolve) => setTimeout(resolve, 100));
  return { socket, closed };
}

async function migrationCount(dbPath) {
  const SQL = await initSqlJs();
  const db = new SQL.Database(await readFile(dbPath));
  const result = db.exec(
    "SELECT COUNT(*) AS count FROM schema_migrations WHERE name = '2026-07-15-admin-auth-cookie'",
  );
  const count = result[0]?.values[0]?.[0];
  db.close();
  return count;
}

async function storedAdminCount(dbPath) {
  const SQL = await initSqlJs();
  const db = new SQL.Database(await readFile(dbPath));
  const result = db.exec("SELECT COUNT(*) AS count FROM users WHERE permission = 'admin'");
  const count = result[0]?.values[0]?.[0];
  db.close();
  return count;
}

beforeEach(async () => {
  tempDir = await mkdtemp(join(tmpdir(), 'kitepop-startup-'));
  children = new Set();
});

afterEach(async () => {
  await Promise.all([...children].map((child) => stopChild(child).catch(() => undefined)));
  await rm(tempDir, { force: true, recursive: true });
});

describe('standalone server startup', () => {
  it('starts production with exactly one admin and repeats the migration idempotently', async () => {
    const dbPath = join(tempDir, 'blog.sqlite');
    await seedUsersDatabase(dbPath, 1);

    for (const signal of ['SIGTERM', 'SIGINT']) {
      const { child, output } = spawnServer(childEnvironment(dbPath));
      const listeningPort = await waitForListening(child, output);
      expect(listeningPort).toBeTypeOf('number');
      const me = await fetch(`http://127.0.0.1:${listeningPort}/api/users/me`);
      expect(me.status).toBe(401);
      expect(me.headers.get('cache-control')).toBe('private, no-store');
      expect(await stopChild(child, signal)).toEqual({ code: 0, signal: null });
      expect(output.stderr).not.toContain('UV_HANDLE_CLOSING');
    }

    expect(await migrationCount(dbPath)).toBe(1);
    await expect(rm(dbPath)).resolves.toBeUndefined();
  }, 30_000);

  it('starts production with multiple admins after the auth migration is already applied', async () => {
    const dbPath = join(tempDir, 'multiple-admins-after-migration.sqlite');
    await seedUsersDatabase(dbPath, 1);

    const initial = spawnServer(childEnvironment(dbPath));
    await waitForListening(initial.child, initial.output);
    expect(await stopChild(initial.child)).toEqual({ code: 0, signal: null });
    expect(await migrationCount(dbPath)).toBe(1);

    await addAdminUser(dbPath, 2);

    const restarted = spawnServer(childEnvironment(dbPath));
    const listeningPort = await waitForListening(restarted.child, restarted.output);
    expect(listeningPort).toBeTypeOf('number');
    expect(await stopChild(restarted.child)).toEqual({ code: 0, signal: null });
    expect(await storedAdminCount(dbPath)).toBe(2);
  });

  it('rejects production with no admin after the auth migration is already applied', async () => {
    const dbPath = join(tempDir, 'no-admin-after-migration.sqlite');
    await seedUsersDatabase(dbPath, 1);

    const initial = spawnServer(childEnvironment(dbPath));
    await waitForListening(initial.child, initial.output);
    expect(await stopChild(initial.child)).toEqual({ code: 0, signal: null });
    expect(await migrationCount(dbPath)).toBe(1);

    await removeAllAdmins(dbPath);

    const restarted = spawnServer(childEnvironment(dbPath));
    const result = await waitForClose(restarted.child, 1_000);
    expect(result.code).not.toBe(0);
    expect(restarted.output.stderr).toContain('requires at least one admin');
    expect(await storedAdminCount(dbPath)).toBe(0);
  });

  it('bounds shutdown with an active partial POST and releases the database', async () => {
    const dbPath = join(tempDir, 'active-request.sqlite');
    await seedUsersDatabase(dbPath, 1);
    const { child, output } = spawnServer(childEnvironment(dbPath));
    const listeningPort = await waitForListening(child, output);
    const { socket, closed } = await openPartialPost(listeningPort);

    try {
      expect(socket.destroyed).toBe(false);
      const startedAt = Date.now();
      const result = await stopChild(child);
      const elapsedMs = Date.now() - startedAt;

      expect(result).toEqual({ code: 0, signal: null });
      expect(elapsedMs).toBeLessThan(START_TIMEOUT_MS);
      await expect(Promise.race([
        closed,
        new Promise((_, reject) => setTimeout(() => reject(new Error('client remained connected')), 1_000)),
      ])).resolves.toBeUndefined();
      expect(socket.destroyed).toBe(true);
      expect(output.stderr).not.toContain('UV_HANDLE_CLOSING');
      expect(await migrationCount(dbPath)).toBe(1);
      await expect(rm(dbPath)).resolves.toBeUndefined();
    } finally {
      socket.destroy();
    }
  }, 20_000);

  it.each([0, 2])('rejects production with %i admins before changing the database', async (adminCount) => {
    const dbPath = join(tempDir, `admins-${adminCount}.sqlite`);
    await seedUsersDatabase(dbPath, adminCount);
    const beforeHash = sha256(await readFile(dbPath));
    const { child, output } = spawnServer(childEnvironment(dbPath));

    const result = await waitForClose(child);

    expect(result.code).not.toBe(0);
    expect(output.stderr).toContain('requires exactly one admin');
    expect(sha256(await readFile(dbPath))).toBe(beforeHash);
    expect(await storedAdminCount(dbPath)).toBe(adminCount);
    await expect(rm(dbPath)).resolves.toBeUndefined();
  });

  it.each([
    ['missing', undefined],
    ['invalid', 'prodution'],
  ])('rejects %s NODE_ENV before opening the database', async (_label, nodeEnv) => {
    const dbPath = join(tempDir, 'must-not-exist.sqlite');
    const { child, output } = spawnServer(childEnvironment(dbPath, { NODE_ENV: nodeEnv }));

    const result = await waitForClose(child, 3_000);

    expect(result.code).not.toBe(0);
    expect(output.stderr).toContain('NODE_ENV');
    await expect(readFile(dbPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('validates production SITE_URL before opening the database', async () => {
    const dbPath = join(tempDir, 'must-not-exist.sqlite');
    const { child, output } = spawnServer(childEnvironment(dbPath, { SITE_URL: 'not a URL' }));

    const result = await waitForClose(child);

    expect(result.code).not.toBe(0);
    expect(output.stderr).toContain('SITE_URL');
    await expect(readFile(dbPath)).rejects.toMatchObject({ code: 'ENOENT' });
  });

  it('exits promptly and releases its database when the listen port is occupied', async () => {
    const dbPath = join(tempDir, 'blog.sqlite');
    await seedUsersDatabase(dbPath, 1);
    const { port, server } = await reservePort();
    const { child, output } = spawnServer(childEnvironment(dbPath, { PORT: String(port) }));

    try {
      const result = await waitForClose(child);
      expect(result.code).not.toBe(0);
      expect(output.stderr).toContain('EADDRINUSE');
      expect(output.stderr).not.toContain('UV_HANDLE_CLOSING');
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }

    expect(await migrationCount(dbPath)).toBe(1);
    await expect(rm(dbPath)).resolves.toBeUndefined();
  });
});
