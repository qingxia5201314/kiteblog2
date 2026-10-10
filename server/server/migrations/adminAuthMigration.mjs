export const ADMIN_AUTH_MIGRATION_NAME = '2026-07-15-admin-auth-cookie';

function readOne(db, sql, params = []) {
  const statement = db.prepare(sql);
  try {
    statement.bind(params);
    return statement.step() ? statement.getAsObject() : undefined;
  } finally {
    statement.free();
  }
}

function tableExists(db, name) {
  return Boolean(readOne(db, "SELECT 1 AS present FROM sqlite_master WHERE type = 'table' AND name = ?", [name]));
}

export function runAdminAuthMigration({ database, now = () => new Date(), requireSingleAdmin = false }) {
  const { db } = database;
  return database.transaction(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name TEXT PRIMARY KEY,
        applied_at TEXT NOT NULL
      )
    `);

    const alreadyApplied = readOne(db, 'SELECT 1 AS applied FROM schema_migrations WHERE name = ?', [
      ADMIN_AUTH_MIGRATION_NAME,
    ]);
    if (alreadyApplied && (tableExists(db, 'admin_sessions') || tableExists(db, 'accounting_sessions'))) {
      throw new Error('Legacy auth tables detected after the admin auth migration');
    }
    const adminCount = Number(readOne(db, "SELECT COUNT(*) AS count FROM users WHERE permission = 'admin'").count);
    if (alreadyApplied) return { applied: false, adminCount };
    if (requireSingleAdmin && adminCount !== 1) {
      throw new Error(`Admin auth migration requires exactly one admin; found ${adminCount}`);
    }

    db.run('DELETE FROM user_sessions');
    db.run('DROP TABLE IF EXISTS admin_sessions');
    db.run('DROP TABLE IF EXISTS accounting_sessions');
    db.run('INSERT INTO schema_migrations (name, applied_at) VALUES (?, ?)', [
      ADMIN_AUTH_MIGRATION_NAME,
      now().toISOString(),
    ]);
    database.persist();

    return { applied: true, adminCount };
  });
}
