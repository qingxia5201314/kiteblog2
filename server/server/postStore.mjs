import { calculateReadingMinutes, createId, nowIso, sortPostsByDate, uniqueSlug } from './blogModel.mjs';
import { seedPosts } from './seedPosts.mjs';
import { createSqliteDatabase } from './sqliteDatabase.mjs';

function rowToPost(row) {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: row.category,
    tags: JSON.parse(row.tags_json),
    content: row.content,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.published_at || '',
    scheduledAt: row.scheduled_at || '',
    scheduleError: row.schedule_error || '',
    cover: row.cover,
    coverImage: row.cover_image || ''
  };
}

function rowToComment(row) {
  return {
    id: row.id,
    postId: row.post_id,
    userId: row.user_id || '',
    nickname: row.nickname,
    role: row.role || '',
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at || row.created_at
  };
}

function rowToArticleDraft(row) {
  return {
    editingId: row.editing_id || null,
    draft: JSON.parse(row.draft_json),
    updatedAt: row.updated_at
  };
}

function postToParams(post) {
  return [
    post.id,
    post.slug,
    post.title,
    post.summary,
    post.category,
    JSON.stringify(post.tags ?? []),
    post.content,
    post.status,
    post.createdAt,
    post.updatedAt,
    post.cover,
    post.coverImage ?? '',
    post.publishedAt ?? (post.status === 'published' ? post.createdAt : ''),
    post.scheduledAt ?? '',
    post.scheduleError ?? ''
  ];
}

function selectAll(db) {
  const rows = db.exec('SELECT * FROM posts');
  if (rows.length === 0) return [];

  const { columns, values } = rows[0];
  return values.map((value) => {
    const row = Object.fromEntries(columns.map((column, index) => [column, value[index]]));
    return rowToPost(row);
  });
}

function initSchema(db) {
  const requiredTables = ['posts', 'post_comments', 'article_editor_drafts'];
  let changed = requiredTables.some(
    (table) => !db.exec("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [table]).length
  );

  db.run(`
    CREATE TABLE IF NOT EXISTS posts (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      summary TEXT NOT NULL,
      category TEXT NOT NULL,
      tags_json TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      cover TEXT NOT NULL,
      cover_image TEXT NOT NULL DEFAULT '',
      published_at TEXT NOT NULL DEFAULT '',
      scheduled_at TEXT NOT NULL DEFAULT '',
      schedule_error TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS post_comments (
      id TEXT PRIMARY KEY,
      post_id TEXT NOT NULL,
      user_id TEXT NOT NULL DEFAULT '',
      nickname TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS article_editor_drafts (
      key TEXT PRIMARY KEY,
      editing_id TEXT NOT NULL DEFAULT '',
      draft_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);

  const commentColumns = db.exec('PRAGMA table_info(post_comments)')?.[0]?.values?.map((row) => row[1]) ?? [];
  if (!commentColumns.includes('user_id')) {
    db.run("ALTER TABLE post_comments ADD COLUMN user_id TEXT NOT NULL DEFAULT ''");
    changed = true;
  }
  if (!commentColumns.includes('updated_at')) {
    db.run("ALTER TABLE post_comments ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''");
    changed = true;
  }
  const commentsToBackfill = db.exec("SELECT COUNT(*) FROM post_comments WHERE updated_at = ''")[0]?.values[0][0] ?? 0;
  if (commentsToBackfill > 0) {
    db.run("UPDATE post_comments SET updated_at = created_at WHERE updated_at = ''");
    changed = true;
  }

  const postColumns = db.exec('PRAGMA table_info(posts)')?.[0]?.values?.map((row) => row[1]) ?? [];
  if (!postColumns.includes('published_at')) {
    db.run("ALTER TABLE posts ADD COLUMN published_at TEXT NOT NULL DEFAULT ''");
    changed = true;
  }
  if (!postColumns.includes('scheduled_at')) {
    db.run("ALTER TABLE posts ADD COLUMN scheduled_at TEXT NOT NULL DEFAULT ''");
    changed = true;
  }
  if (!postColumns.includes('schedule_error')) {
    db.run("ALTER TABLE posts ADD COLUMN schedule_error TEXT NOT NULL DEFAULT ''");
    changed = true;
  }
  const postsToBackfill =
    db.exec("SELECT COUNT(*) FROM posts WHERE status = 'published' AND published_at = ''")[0]?.values[0][0] ?? 0;
  if (postsToBackfill > 0) {
    db.run("UPDATE posts SET published_at = created_at WHERE status = 'published' AND published_at = ''");
    changed = true;
  }

  const scheduleIndexExists = db.exec(
    "SELECT 1 FROM sqlite_master WHERE type = 'index' AND name = 'idx_posts_scheduled_due'"
  ).length > 0;
  db.run("CREATE INDEX IF NOT EXISTS idx_posts_scheduled_due ON posts(status, scheduled_at)");
  if (!scheduleIndexExists) changed = true;

  return changed;
}

function selectPublishedAt(db, postId) {
  const rows = db.exec('SELECT published_at FROM posts WHERE id = ?', [postId]);
  return rows[0]?.values?.[0]?.[0] || '';
}

function selectComments(db, postId) {
  const rows = db.exec('SELECT * FROM post_comments WHERE post_id = ? ORDER BY created_at DESC', [postId]);
  if (rows.length === 0) return [];
  const { columns, values } = rows[0];
  return values.map((value) => rowToComment(Object.fromEntries(columns.map((column, index) => [column, value[index]]))));
}

function selectComment(db, commentId) {
  const rows = db.exec('SELECT * FROM post_comments WHERE id = ?', [commentId]);
  if (rows.length === 0) return undefined;
  const { columns, values } = rows[0];
  return rowToComment(Object.fromEntries(columns.map((column, index) => [column, values[0][index]])));
}

function selectArticleDraft(db, key = 'article-editor') {
  const rows = db.exec('SELECT * FROM article_editor_drafts WHERE key = ?', [key]);
  if (rows.length === 0) return undefined;
  const { columns, values } = rows[0];
  return rowToArticleDraft(Object.fromEntries(columns.map((column, index) => [column, values[0][index]])));
}

function canManageComment(comment, user) {
  return Boolean(user && (user.permission === 'admin' || comment.userId === user.id));
}

function insertPost(db, post) {
  db.run(
    `INSERT INTO posts (
      id, slug, title, summary, category, tags_json, content, status, created_at, updated_at, cover, cover_image,
      published_at, scheduled_at, schedule_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    postToParams(post)
  );
}

function rowsFromResult(result) {
  if (!result.length) return [];
  const { columns, values } = result[0];
  return values.map((value) => Object.fromEntries(columns.map((column, index) => [column, value[index]])));
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, '\\$&');
}

function queryPublicPosts(db, options) {
  const effectivePublishedAt = "COALESCE(NULLIF(p.published_at, ''), p.updated_at)";
  const where = ["p.status = 'published'"];
  const whereParams = [];

  if (options.category !== 'all') {
    where.push('p.category = ?');
    whereParams.push(options.category);
  }
  if (options.dateFrom) {
    where.push(`${effectivePublishedAt} >= ?`);
    whereParams.push(options.dateFrom);
  }
  for (const tag of options.tags) {
    where.push(
      'EXISTS (SELECT 1 FROM json_each(p.tags_json) AS tag WHERE lower(CAST(tag.value AS TEXT)) = ?)'
    );
    whereParams.push(tag.toLowerCase());
  }

  const pattern = `%${escapeLike(options.q.toLowerCase())}%`;
  const scoreSql = options.q
    ? `(CASE WHEN lower(p.title) LIKE ? ESCAPE '\\' THEN 5 ELSE 0 END +
        CASE WHEN EXISTS (
          SELECT 1 FROM json_each(p.tags_json) AS search_tag
          WHERE lower(CAST(search_tag.value AS TEXT)) LIKE ? ESCAPE '\\'
        ) THEN 4 ELSE 0 END +
        CASE WHEN lower(p.category) LIKE ? ESCAPE '\\' THEN 4 ELSE 0 END +
        CASE WHEN lower(p.summary) LIKE ? ESCAPE '\\' THEN 2 ELSE 0 END +
        CASE WHEN lower(p.content) LIKE ? ESCAPE '\\' THEN 1 ELSE 0 END)`
    : '0';
  const scoreParams = options.q ? [pattern, pattern, pattern, pattern, pattern] : [];
  const rankedSql = `
    SELECT
      p.id, p.slug, p.title, p.summary, p.category, p.tags_json, p.status,
      p.created_at, p.updated_at, p.cover, p.cover_image,
      p.content AS reading_content,
      ${effectivePublishedAt} AS effective_published_at,
      ${scoreSql} AS score
    FROM posts AS p
    WHERE ${where.join(' AND ')}`;
  const rankedParams = [...scoreParams, ...whereParams];
  const pageWhere = [];
  const pageParams = [];

  if (options.cursor) {
    if (options.q) {
      pageWhere.push(`(
        score < ? OR
        (score = ? AND effective_published_at < ?) OR
        (score = ? AND effective_published_at = ? AND id < ?)
      )`);
      pageParams.push(
        options.cursor.score,
        options.cursor.score,
        options.cursor.publishedAt,
        options.cursor.score,
        options.cursor.publishedAt,
        options.cursor.id
      );
    } else {
      pageWhere.push('(effective_published_at < ? OR (effective_published_at = ? AND id < ?))');
      pageParams.push(options.cursor.publishedAt, options.cursor.publishedAt, options.cursor.id);
    }
  }

  const orderBy = options.q
    ? 'score DESC, effective_published_at DESC, id DESC'
    : 'effective_published_at DESC, id DESC';
  const pageSql = `
    WITH ranked AS (${rankedSql}),
    matched AS (
      SELECT *, COUNT(*) OVER () AS full_total
      FROM ranked
      ${options.q ? 'WHERE score > 0' : ''}
    )
    SELECT * FROM matched
    ${pageWhere.length ? `WHERE ${pageWhere.join(' AND ')}` : ''}
    ORDER BY ${orderBy}
    LIMIT ?`;
  const pageRows = rowsFromResult(db.exec(pageSql, [...rankedParams, ...pageParams, options.limit]));
  const posts = pageRows.map((row) => ({
    id: row.id,
    slug: row.slug,
    title: row.title,
    summary: row.summary,
    category: row.category,
    tags: JSON.parse(row.tags_json),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    publishedAt: row.effective_published_at,
    cover: row.cover,
    coverImage: row.cover_image || '',
    readingMinutes: calculateReadingMinutes(row.reading_content),
    _score: row.score
  }));
  let total = pageRows[0]?.full_total;
  if (total === undefined) {
    const countSql = `
      WITH ranked AS (${rankedSql})
      SELECT COUNT(*) AS total FROM ranked
      ${options.q ? 'WHERE score > 0' : ''}`;
    total = rowsFromResult(db.exec(countSql, rankedParams))[0]?.total ?? 0;
  }
  return { posts, total };
}

export async function createPostStore({ dbPath = './data/blog.sqlite', database } = {}) {
  const sqlite = database ?? (await createSqliteDatabase({ dbPath }));
  const { db } = sqlite;

  const schemaChanged = initSchema(db);

  let seeded = false;
  if (selectAll(db).length === 0) {
    seedPosts.forEach((post) => insertPost(db, post));
    seeded = true;
  }
  if (schemaChanged || seeded) {
    sqlite.persist();
  }

  return {
    list({ includeDrafts = false } = {}) {
      return sortPostsByDate(selectAll(db).filter((post) => includeDrafts || post.status === 'published'));
    },

    queryPublic(options) {
      return queryPublicPosts(db, options);
    },

    get(idOrSlug) {
      return selectAll(db).find((post) => post.id === idOrSlug || post.slug === idOrSlug);
    },

    create(draft) {
      const posts = selectAll(db);
      const now = nowIso();
      const post = {
        ...draft,
        id: createId(),
        slug: uniqueSlug(draft.title, posts),
        createdAt: now,
        updatedAt: now,
        publishedAt: draft.status === 'published' ? now : '',
        scheduledAt: draft.status === 'scheduled' ? String(draft.scheduledAt || '') : '',
        scheduleError: ''
      };

      insertPost(db, post);
      sqlite.persist();
      return post;
    },

    update(id, patch) {
      const posts = selectAll(db);
      const current = posts.find((post) => post.id === id);
      if (!current) return undefined;

      const previousPublishedAt = selectPublishedAt(db, id);
      const nextStatus = patch.status ?? current.status;
      const updatedAt = nowIso();

      const updated = {
        ...current,
        ...patch,
        slug: !previousPublishedAt && patch.title ? uniqueSlug(patch.title, posts, id) : current.slug,
        updatedAt
      };
      const publishedAt = previousPublishedAt || (nextStatus === 'published' ? updatedAt : '');
      const scheduledAt = nextStatus === 'scheduled' ? String(updated.scheduledAt || '') : '';
      const scheduleError = nextStatus === 'scheduled' ? String(updated.scheduleError || '') : '';

      db.run(
        `UPDATE posts SET
          slug = ?, title = ?, summary = ?, category = ?, tags_json = ?, content = ?,
          status = ?, updated_at = ?, cover = ?, cover_image = ?, published_at = ?, scheduled_at = ?, schedule_error = ?
        WHERE id = ?`,
        [
          updated.slug,
          updated.title,
          updated.summary,
          updated.category,
          JSON.stringify(updated.tags ?? []),
          updated.content,
          updated.status,
          updated.updatedAt,
          updated.cover,
          updated.coverImage ?? '',
          publishedAt,
          scheduledAt,
          scheduleError,
          id
        ]
      );
      sqlite.persist();
      return { ...updated, publishedAt, scheduledAt, scheduleError };
    },

    listDueScheduled(dueAt) {
      return rowsFromResult(db.exec(
        `SELECT * FROM posts
         WHERE status = 'scheduled' AND scheduled_at != '' AND scheduled_at <= ?
         ORDER BY scheduled_at ASC, id ASC`,
        [dueAt]
      )).map(rowToPost);
    },

    publishScheduled(id, publishedAt) {
      db.run(
        `UPDATE posts SET
          status = 'published', published_at = ?, updated_at = ?, scheduled_at = '', schedule_error = ''
         WHERE id = ? AND status = 'scheduled' AND scheduled_at != '' AND scheduled_at <= ?`,
        [publishedAt, publishedAt, id, publishedAt]
      );
      if (db.getRowsModified() === 0) return undefined;
      sqlite.persist();
      return this.get(id);
    },

    setScheduleError(id, message) {
      db.run(
        "UPDATE posts SET schedule_error = ? WHERE id = ? AND status = 'scheduled'",
        [String(message || ''), id]
      );
      if (db.getRowsModified() === 0) return undefined;
      sqlite.persist();
      return this.get(id);
    },

    remove(id) {
      const existing = this.get(id);
      if (!existing) return false;
      db.run('DELETE FROM posts WHERE id = ?', [id]);
      sqlite.persist();
      return true;
    },

    getArticleDraft() {
      return selectArticleDraft(db);
    },

    saveArticleDraft(payload) {
      const requestedUpdatedAt = String(payload?.updatedAt || '');
      const now = Number.isFinite(Date.parse(requestedUpdatedAt)) ? requestedUpdatedAt : nowIso();
      const draft = {
        title: String(payload?.draft?.title ?? ''),
        summary: String(payload?.draft?.summary ?? ''),
        category: payload?.draft?.category || 'life',
        tags: Array.isArray(payload?.draft?.tags) ? payload.draft.tags.map((tag) => String(tag)) : [],
        content: String(payload?.draft?.content ?? ''),
        status: payload?.draft?.status === 'published' ? 'published' : 'draft',
        cover: payload?.draft?.cover || payload?.draft?.category || 'life',
        coverImage: String(payload?.draft?.coverImage ?? '')
      };
      const saved = {
        editingId: payload?.editingId ? String(payload.editingId) : null,
        draft,
        updatedAt: now
      };

      db.run(
        `INSERT INTO article_editor_drafts (key, editing_id, draft_json, updated_at)
         VALUES (?, ?, ?, ?)
         ON CONFLICT(key) DO UPDATE SET
           editing_id = excluded.editing_id,
           draft_json = excluded.draft_json,
           updated_at = excluded.updated_at`,
        ['article-editor', saved.editingId || '', JSON.stringify(saved.draft), saved.updatedAt]
      );
      sqlite.persist();
      return saved;
    },

    clearArticleDraft() {
      const existing = selectArticleDraft(db);
      if (!existing) return false;
      db.run('DELETE FROM article_editor_drafts WHERE key = ?', ['article-editor']);
      sqlite.persist();
      return true;
    },

    listComments(idOrSlug) {
      const post = this.get(idOrSlug);
      if (!post) return [];
      return selectComments(db, post.id);
    },

    createComment(idOrSlug, draft, user) {
      const post = this.get(idOrSlug);
      if (!post) return undefined;
      const content = String(draft.content || '').trim();
      if (!content) throw new Error('Comment content is required');
      const comment = {
        id: createId(),
        postId: post.id,
        userId: user?.id || '',
        nickname: String(user?.nickname || draft.nickname || '匿名访客').trim() || '匿名访客',
        role: user?.permission === 'admin' ? '管理员' : '阅读用户',
        content,
        createdAt: nowIso(),
        updatedAt: nowIso()
      };
      db.run(
        `INSERT INTO post_comments (id, post_id, user_id, nickname, role, content, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          comment.id,
          comment.postId,
          comment.userId,
          comment.nickname,
          comment.role,
          comment.content,
          comment.createdAt,
          comment.updatedAt
        ]
      );
      sqlite.persist();
      return comment;
    },

    updateComment(commentId, patch, user) {
      const current = selectComment(db, commentId);
      if (!current || !canManageComment(current, user)) return undefined;
      const content = String(patch.content || '').trim();
      if (!content) throw new Error('Comment content is required');
      const updated = {
        ...current,
        content,
        updatedAt: nowIso()
      };
      db.run('UPDATE post_comments SET content = ?, updated_at = ? WHERE id = ?', [
        updated.content,
        updated.updatedAt,
        commentId
      ]);
      sqlite.persist();
      return updated;
    },

    removeComment(commentId, user) {
      const current = selectComment(db, commentId);
      if (!current || !canManageComment(current, user)) return false;
      db.run('DELETE FROM post_comments WHERE id = ?', [commentId]);
      sqlite.persist();
      return true;
    }
  };
}
