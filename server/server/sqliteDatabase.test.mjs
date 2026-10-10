import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { createSqliteDatabase } from './sqliteDatabase.mjs';

describe('sqlite database lifecycle', () => {
  it('exposes an idempotent close operation', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'kitepop-sqlite-close-'));
    const database = await createSqliteDatabase({ dbPath: join(tempDir, 'blog.sqlite') });

    try {
      expect(() => database.close()).not.toThrow();
      expect(() => database.close()).not.toThrow();
    } finally {
      database.db.close?.();
      await rm(tempDir, { force: true, recursive: true });
    }
  });
});
