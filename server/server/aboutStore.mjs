import { emptyAboutProfile, normalizeAboutProfile } from './aboutModel.mjs'

const PROFILE_KEY = 'primary'

export function createAboutStore({ database }) {
  const tableExists = database.db.exec(
    "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'about_profile' LIMIT 1",
  ).length > 0

  database.db.run(`
    CREATE TABLE IF NOT EXISTS about_profile (
      profile_key TEXT PRIMARY KEY NOT NULL,
      avatar_url TEXT NOT NULL,
      display_name TEXT NOT NULL,
      identity_tags_json TEXT NOT NULL,
      intro TEXT NOT NULL,
      github_url TEXT NOT NULL,
      content TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  if (!tableExists) database.persist()

  return {
    get() {
      const statement = database.db.prepare(`
        SELECT avatar_url, display_name, identity_tags_json, intro, github_url, content, updated_at
        FROM about_profile
        WHERE profile_key = ?
      `)

      try {
        statement.bind([PROFILE_KEY])
        if (!statement.step()) return emptyAboutProfile()
        const row = statement.getAsObject()
        return {
          avatarUrl: row.avatar_url,
          displayName: row.display_name,
          identityTags: parseIdentityTags(row.identity_tags_json),
          intro: row.intro,
          githubUrl: row.github_url,
          content: row.content,
          updatedAt: row.updated_at,
        }
      } finally {
        statement.free()
      }
    },

    save(input) {
      const profile = normalizeAboutProfile(input)
      const saved = {
        ...profile,
        updatedAt: new Date().toISOString(),
      }

      database.db.run(`
        INSERT INTO about_profile (
          profile_key, avatar_url, display_name, identity_tags_json, intro, github_url, content, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(profile_key) DO UPDATE SET
          avatar_url = excluded.avatar_url,
          display_name = excluded.display_name,
          identity_tags_json = excluded.identity_tags_json,
          intro = excluded.intro,
          github_url = excluded.github_url,
          content = excluded.content,
          updated_at = excluded.updated_at
      `, [
        PROFILE_KEY,
        saved.avatarUrl,
        saved.displayName,
        JSON.stringify(saved.identityTags),
        saved.intro,
        saved.githubUrl,
        saved.content,
        saved.updatedAt,
      ])
      database.persist()

      return saved
    },
  }
}

function parseIdentityTags(value) {
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) && parsed.every((tag) => typeof tag === 'string') ? parsed : []
  } catch {
    return []
  }
}
