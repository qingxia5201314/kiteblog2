# Article Comments

Article comments are stored in the SQLite-backed `post_comments` table.

## Behavior

- Opening an article detail page loads comments from `/api/posts/:slug/comments`.
- Creating, editing, and deleting comments still require a valid user session.
- After a new comment is created, the returned database comment is inserted into the current article comment list.
- Leaving the article detail page clears the local comment view so another article does not show stale comments.

## Verification

- `npm test -- --run src/App.test.tsx -t "loads persisted comments"`
- `npm test -- --run src/App.test.tsx server/postStore.test.mjs`
- `npm run build`

## Rollback

- `git checkout -- src/pages/HomePage.tsx src/App.test.tsx progress.md`
- `git rm docs/comments.md`
