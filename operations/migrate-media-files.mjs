#!/usr/bin/env node
// Finish the media migration: pull the remaining `/api/files/raw/<id>` images out
// of the legacy Node app and into the content repo.
//
// Background
// ----------
// operations/migrate-media.cjs moved `hosted_images` (/api/images/raw/<id>) into
// source/media/migrated/ and rewrote those references. It did not handle the
// other upload table, `uploaded_files` (/api/files/raw/<id>?token=...), so a
// handful of posts still point at the legacy app (/opt/kitepop-blog, systemd
// kitepop-blog.service). That app is still running and still serves those files,
// which is the only reason those posts look fine today.
//
// This script copies the files, rewrites the references to local paths, and
// leaves the legacy app alone. Idempotent: files already copied are skipped, and
// already-rewritten references no longer match.
//
// Usage:  node operations/migrate-media-files.mjs [--dry-run]
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

// The legacy app ships sql.js as a CommonJS package; load it through
// createRequire so this ESM script can use it.
const require = createRequire(import.meta.url);

const CONTENT = process.env.KITEPOP_CONTENT_DIR || '/opt/kitepop-content';
const LEGACY_UPLOADS = process.env.KITEPOP_LEGACY_UPLOADS || '/opt/kitepop-blog/data/uploads';
const LEGACY_DB = process.env.KITEPOP_LEGACY_DB || '/opt/kitepop-blog/data/blog.sqlite';
const SQLJS = process.env.KITEPOP_SQLJS || '/opt/kitepop-blog/node_modules/sql.js';
const DEST_REL = 'source/media/migrated';
const DRY = process.argv.includes('--dry-run');

const EXT = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
  'image/svg+xml': '.svg',
  'application/pdf': '.pdf',
  'image/bmp': '.bmp',
  'image/avif': '.avif'
};

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith('.md')) out.push(full);
  }
  return out;
}

async function main() {
  process.chdir(CONTENT);
  if (!fs.existsSync(LEGACY_UPLOADS)) throw new Error(`no ${LEGACY_UPLOADS}`);
  if (!fs.existsSync(LEGACY_DB)) throw new Error(`no ${LEGACY_DB}`);

  const files = walk('source');
  const refRe = /(?:https?:\/\/kitepop\.top)?\/api\/files\/raw\/([A-Za-z0-9-]+)(?:\?[^)\s"']*)?/g;

  // 1. every legacy file id still referenced by any post
  const ids = new Set();
  for (const f of files) {
    for (const m of fs.readFileSync(f, 'utf8').matchAll(refRe)) ids.add(m[1]);
  }
  if (ids.size === 0) {
    console.log('no legacy /api/files/raw/ references left; nothing to do');
    return;
  }
  console.log(`referenced legacy file ids: ${ids.size}`);

  // 2. ask the legacy database where each one lives and what type it is
  const initSqlJs = require(SQLJS);
  const SQL = await initSqlJs();
  const db = new SQL.Database(fs.readFileSync(LEGACY_DB));
  const stmt = db.prepare(
    'SELECT id, storage_name, content_type, original_name FROM uploaded_files WHERE id = ?'
  );
  const meta = new Map();
  for (const id of ids) {
    stmt.bind([id]);
    if (stmt.step()) {
      const r = stmt.getAsObject();
      meta.set(id, r);
    }
    stmt.reset();
  }
  stmt.free();

  // 3. copy the bytes into the content tree
  fs.mkdirSync(DEST_REL, { recursive: true });
  const extFor = new Map();
  for (const [id, r] of meta) {
    const ext = EXT[r.content_type] || path.extname(r.original_name || '') || '.bin';
    extFor.set(id, ext);
    const target = path.join(DEST_REL, `${id}${ext}`);
    const src = path.join(LEGACY_UPLOADS, r.storage_name);
    if (!fs.existsSync(src)) {
      console.warn(`  !! ${id}: missing source ${src}`);
      continue;
    }
    if (fs.existsSync(target)) {
      console.log(`  = ${id}${ext} already copied`);
    } else if (DRY) {
      console.log(`  [dry-run] copy ${src} -> ${target}`);
    } else {
      fs.copyFileSync(src, target);
      console.log(`  + ${id}${ext}  (${r.original_name})`);
    }
  }
  for (const id of ids) {
    if (!meta.has(id)) console.warn(`  !! ${id}: not present in uploaded_files`);
  }

  // 4. rewrite references
  let touched = 0;
  for (const f of files) {
    const before = fs.readFileSync(f, 'utf8');
    const after = before.replace(refRe, (match, id) => {
      const ext = extFor.get(id);
      return ext ? `/media/migrated/${id}${ext}` : match;
    });
    if (after !== before) {
      if (!DRY) fs.writeFileSync(f, after);
      console.log(`  ~ rewrote ${f}`);
      touched += 1;
    }
  }
  console.log(
    `${DRY ? '[dry-run] ' : ''}done: ${meta.size} file(s) available, ${touched} post(s) rewritten`
  );
  if (DRY) console.log('re-run without --dry-run to apply');
}

main().catch((err) => {
  console.error('migrate-media-files:', err.message);
  process.exit(1);
});
