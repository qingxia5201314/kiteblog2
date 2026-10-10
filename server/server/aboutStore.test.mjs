import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createSqliteDatabase } from './sqliteDatabase.mjs'
import { createAboutStore } from './aboutStore.mjs'

const tempDirs = []

afterEach(() => {
  for (const directory of tempDirs.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})

async function openStore(dbPath = temporaryDatabasePath()) {
  const database = await createSqliteDatabase({ dbPath })
  return { database, store: createAboutStore({ database }) }
}

function temporaryDatabasePath() {
  const directory = mkdtempSync(join(tmpdir(), 'about-store-'))
  tempDirs.push(directory)
  return join(directory, 'blog.sqlite')
}

function validProfile(overrides = {}) {
  return {
    avatarUrl: ' https://example.test/avatar.png ',
    displayName: ' Kite ',
    identityTags: [' Developer ', 'developer', 'Blogger'],
    intro: ' Hello there. ',
    githubUrl: ' https://github.com/KitePPP/ ',
    content: '# About me\n',
    ...overrides,
  }
}

describe('about profile store', () => {
  it('creates and persists its schema while returning an empty initial profile', async () => {
    const dbPath = temporaryDatabasePath()
    const { database, store } = await openStore(dbPath)

    expect(store.get()).toEqual({
      avatarUrl: '',
      displayName: '',
      identityTags: [],
      intro: '',
      githubUrl: '',
      content: '',
      updatedAt: '',
    })

    database.db.close()
    const reopened = await createSqliteDatabase({ dbPath })
    expect(reopened.db.exec("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'about_profile'")[0].values)
      .toEqual([['about_profile']])
    reopened.db.close()
  })

  it('normalizes, timestamps, saves, and returns a profile', async () => {
    const { database, store } = await openStore()

    const saved = store.save(validProfile())

    expect(saved).toMatchObject({
      avatarUrl: 'https://example.test/avatar.png',
      displayName: 'Kite',
      identityTags: ['Developer', 'Blogger'],
      intro: 'Hello there.',
      githubUrl: 'https://github.com/KitePPP',
      content: '# About me\n',
    })
    expect(new Date(saved.updatedAt).toISOString()).toBe(saved.updatedAt)
    expect(store.get()).toEqual(saved)
    database.db.close()
  })

  it('persists the saved profile across database reopen', async () => {
    const dbPath = temporaryDatabasePath()
    const first = await openStore(dbPath)
    const saved = first.store.save(validProfile())
    first.database.db.close()

    const reopened = await openStore(dbPath)
    expect(reopened.store.get()).toEqual(saved)
    reopened.database.db.close()
  })

  it('overwrites the fixed primary row on subsequent saves', async () => {
    const { database, store } = await openStore()
    store.save(validProfile())

    const updated = store.save(validProfile({ displayName: 'Second', identityTags: ['Updated'] }))

    expect(store.get()).toEqual(updated)
    expect(database.db.exec('SELECT profile_key, display_name FROM about_profile')[0].values)
      .toEqual([['primary', 'Second']])
    database.db.close()
  })

  it('can initialize repeatedly without damaging persisted data', async () => {
    const { database, store } = await openStore()
    const saved = store.save(validProfile())

    const secondStore = createAboutStore({ database })

    expect(secondStore.get()).toEqual(saved)
    expect(database.db.exec('SELECT COUNT(*) FROM about_profile')[0].values[0][0]).toBe(1)
    database.db.close()
  })

  it('does not write when profile validation fails', async () => {
    const { database, store } = await openStore()

    expect(() => store.save({ displayName: '   ' })).toThrow('请填写名称')
    expect(database.db.exec('SELECT COUNT(*) FROM about_profile')[0].values[0][0]).toBe(0)
    database.db.close()
  })

  it('runs the single upsert directly and persists exactly once', () => {
    const run = vi.fn()
    const persist = vi.fn()
    const transaction = vi.fn(() => {
      throw new Error('save must not open a transaction')
    })
    const database = {
      db: {
        exec: vi.fn(() => [{}]),
        run,
      },
      persist,
      transaction,
    }
    const store = createAboutStore({ database })
    run.mockClear()

    store.save(validProfile())

    expect(transaction).not.toHaveBeenCalled()
    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0][0]).toContain('INSERT INTO about_profile')
    expect(persist).toHaveBeenCalledTimes(1)
  })

  it('falls back to empty tags when stored JSON is corrupted', async () => {
    const { database, store } = await openStore()
    store.save(validProfile())
    database.db.run("UPDATE about_profile SET identity_tags_json = '{broken' WHERE profile_key = 'primary'")
    database.persist()

    expect(store.get().identityTags).toEqual([])
    database.db.close()
  })

  it('falls back to empty tags when stored JSON is an array with non-string values', async () => {
    const { database, store } = await openStore()
    store.save(validProfile())
    database.db.run("UPDATE about_profile SET identity_tags_json = '[1,null,{}]' WHERE profile_key = 'primary'")

    expect(store.get().identityTags).toEqual([])
    database.db.close()
  })
})
