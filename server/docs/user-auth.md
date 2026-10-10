# User and Administrator Authentication

The site account is the only interactive identity used by readers and administrators. The backend stores opaque sessions in SQLite; the browser receives only an HttpOnly Cookie and JavaScript never receives a session token.

## Session API

- `POST /api/users/register` creates a reader account, creates a 30-day absolute session, and sets the session Cookie. The JSON response contains the user and `expiresAt`, never a token.
- `POST /api/users/login` verifies the site username and password, creates a 30-day absolute session, and sets the session Cookie. The JSON response contains the user and `expiresAt`, never a token.
- `GET /api/users/me` restores the current identity from the Cookie. Missing, expired, revoked, or malformed sessions return `401`.
- `POST /api/users/logout` revokes the current server-side session and clears the Cookie. Replaying the old Cookie does not restore access.

The frontend calls `/api/users/me` during startup and keeps only the returned user profile in memory. A `401` clears the frontend identity; a `403` means the current identity is valid but lacks permission.

## Administrator Boundary

Administrator identity is determined at request time by `users.permission = 'admin'`. No username is hard-coded. A valid administrator session is required for backend content mutations and draft access, accounting, image management, file and folder management, About management, revisions, scheduling, previews, and user management. Public article/About reads, public image reads, valid file capability links, registration, login, and reader-owned comment operations keep their narrower public or user rules.

The last administrator cannot be deleted or demoted. Permission changes and user deletion revoke the affected user's sessions. Before this authentication migration's first production deployment, query the real database selected by the service's `POST_DB_PATH` and require exactly one result from:

```sql
SELECT id, username, nickname FROM users WHERE permission = 'admin';
```

Do not select an account by a remembered username and do not create an administrator automatically when this first-migration precondition fails. After the migration marker exists, production startup requires at least one administrator and supports additional administrators created through user management.

## Production Cookie and Origin Rules

Production must run behind the checked-in `deploy/nginx-kitepop.conf` with:

```dotenv
NODE_ENV=production
SITE_URL=https://kitepop.top
TRUST_PROXY=1
```

The proxy redirects HTTPS `www.kitepop.top` requests to the canonical `https://kitepop.top` origin before serving the application, so browser `Origin` values remain consistent with `SITE_URL`.

Production login and registration responses set:

```text
__Host-kitepop_session; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000
```

The Cookie has no `Domain` attribute and expires after an absolute 30 days; activity does not extend it. Unsafe API methods (`POST`, `PUT`, `PATCH`, and `DELETE`) require an `Origin` exactly matching `SITE_URL` in production.

## Retired Authentication

- `ADMIN_PASSWORD` is removed. The former shared backend and accounting password entry points do not exist.
- The old shared-password sessions, browser Bearer authentication, `admin_sessions`, and `accounting_sessions` are retired. Migration clears legacy session tables and all pre-migration user sessions.
- The frontend performs a one-time deletion of legacy `kitepop-admin-session`, `kitepop-user-session`, and `kitepop-accounting-session` localStorage keys. It never reads those values for authorization.
- File download capability tokens remain intentionally supported for links created by an administrator; they are resource-specific links, not account or administrator authentication.

## Verification and Deployment

Run local gates before deployment:

```powershell
npm test -- --run
npm run build
git diff --check
```

Use `docs/admin-auth-deployment.md` for the production precondition query, paired code/database backup, release steps, role and Cookie checks, and paired rollback. The unified authentication implementation has been completed locally; production VPS deployment is not performed as part of this documentation task.
