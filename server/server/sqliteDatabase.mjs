import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import initSqlJs from 'sql.js';

export async function createSqliteDatabase({ dbPath = './data/blog.sqlite' } = {}) {
  const SQL = await initSqlJs();
  const db = existsSync(dbPath) ? new SQL.Database(readFileSync(dbPath)) : new SQL.Database();
  let transactionDepth = 0;
  let persistPending = false;
  let closed = false;

  function writeDatabase() {
    mkdirSync(dirname(dbPath), { recursive: true });
    writeFileSync(dbPath, Buffer.from(db.export()));
  }

  return {
    db,
    close() {
      if (closed) return;
      closed = true;
      db.close();
    },
    persist() {
      if (transactionDepth > 0) {
        persistPending = true;
        return;
      }
      writeDatabase();
    },
    transaction(callback) {
      const outermost = transactionDepth === 0;
      if (outermost) db.run('BEGIN TRANSACTION');
      transactionDepth += 1;
      try {
        const result = callback();
        transactionDepth -= 1;
        if (outermost) {
          db.run('COMMIT');
          if (persistPending) writeDatabase();
          persistPending = false;
        }
        return result;
      } catch (error) {
        transactionDepth -= 1;
        if (outermost) {
          db.run('ROLLBACK');
          persistPending = false;
        }
        throw error;
      }
    }
  };
}
