# Hono Backend Refactoring and Unified Authentication

## Overview
The blog backend uses Hono with modular routes and shared store/service boundaries. As of 2026-07-15, site accounts and database-backed HttpOnly Cookie sessions are also the only interactive authentication path for reader and administrator workflows.

## Changes Made

### 1. Modular Architecture

#### Main Entry Point
- **`server/index.mjs`**
  - Initializes the shared database, user sessions, and domain stores/services
  - Runs the idempotent administrator-auth migration before listening
  - Hydrates one Cookie-backed identity and enforces the production Origin boundary
  - Sets up Hono app with dependency injection via context
  - Routes all API endpoints to their respective handlers
  - Serves static files with SPA fallback

#### Route Handlers
- **`server/routes/admin.mjs`** - About, drafts, previews, scheduling, and user CRUD for administrators
- **`server/routes/posts.mjs`** - Blog posts and comments (list, create, update, delete)
- **`server/routes/users.mjs`** - User registration, login, logout, and current identity
- **`server/routes/accounting.mjs`** - Administrator-only entries, categories, and settings
- **`server/routes/files.mjs`** - Administrator file management and capability-link downloads
- **`server/routes/folders.mjs`** - File folder CRUD
- **`server/routes/images.mjs`** - Image upload, listing, and public download

#### Middleware
- **`server/middleware/auth.mjs`** - Cookie identity hydration plus `requireUser` and `requireAdmin`
- **`server/middleware/origin.mjs`** - Exact-origin validation for unsafe API methods
- **`server/middleware/static.mjs`** - Static file serving helpers

#### Utilities
- **`server/utils/multipart.mjs`** - Multipart form data parser (preserved from legacy code)

### 2. Current API Behavior

The authentication contract intentionally replaces the former shared-password and browser-token APIs.

**Admin**
- `GET/PUT /api/admin/about` - Manage About content (`admin` only)
- `GET/PUT/DELETE /api/admin/article-draft` - Manage editor drafts (`admin` only)
- `/api/admin/posts/:id/revisions` and `/api/admin/posts/:id/schedule` - Revision and scheduling workflows (`admin` only)
- `GET/POST /api/admin/users` and `PUT/DELETE /api/admin/users/:id` - User management (`admin` only)

**Posts**
- `GET /api/posts` - List posts (with ?includeDrafts=1 for admin)
- `POST /api/posts` and `PUT/DELETE /api/posts/:id` - Create/update/delete (admin only)
- `GET /api/posts/:id/comments` - List comments
- `POST /api/posts/:id/comments` - Create comment (user auth required)
- `PUT/DELETE /api/posts/:id/comments/:commentId` - Update/delete comment (user auth)

**Users**
- `POST /api/users/register` - Register a reader and set an HttpOnly session Cookie; never return a token
- `POST /api/users/login` - Log in and set an HttpOnly session Cookie; never return a token
- `GET /api/users/me` - Restore the current identity from the Cookie
- `POST /api/users/logout` - Revoke the current server-side session and clear the Cookie

**Accounting**
- `GET /api/accounting/month` - Monthly data with filters (`admin` only)
- `POST /api/accounting/entries` and `PUT/DELETE /api/accounting/entries/:id` - Entry CRUD (`admin` only)
- `POST /api/accounting/categories` and `PUT/DELETE /api/accounting/categories/:id` - Category CRUD (`admin` only)
- `PUT /api/accounting/settings` - Update settings

**Files**
- `GET /api/files` - List folder contents (`admin` only)
- `POST /api/files` - Upload file (`admin` only)
- `GET /api/files/raw/:id?token=...` - Download through a resource-specific capability link
- `POST /api/files/:id/link` - Generate an access link (`admin` only)
- `DELETE /api/files/:id` - Delete file (`admin` only)
- `POST/PUT/DELETE /api/file-folders/:id` - Folder management (`admin` only)

**Images**
- `GET /api/images` - List images (`admin` only)
- `POST /api/images` - Upload image (`admin` only)
- `GET /api/images/raw/:id` - Public image download
- `DELETE /api/images/:id` - Delete image (`admin` only)

### 3. Store and Security Layer
Current persistent and authentication units include:
- `sqliteDatabase.mjs`
- `postStore.mjs`
- `userStore.mjs`
- `accountingStore.mjs`
- `fileStore.mjs`
- `imageStore.mjs`
- `fileDownloadHeaders.mjs`
- `passwords.mjs`
- `sessionCookie.mjs`
- `migrations/adminAuthMigration.mjs`

### 4. Key Features

✓ Body size limits:
  - Login and registration JSON: 16 KiB
  - File uploads: configurable through `FILE_UPLOAD_LIMIT`; `0` means no application-level byte limit
  - Image uploads: configurable through `IMAGE_UPLOAD_LIMIT`; `0` means no application-level byte limit

✓ Authentication:
  - One opaque SQLite-backed session for readers and administrators
  - `permission = 'admin'` for backend, accounting, image, file, About, draft, revision, scheduling, and user-management APIs
  - Production Cookie: `__Host-kitepop_session; Secure; HttpOnly; SameSite=Lax; Path=/; Max-Age=2592000`
  - Absolute 30-day expiry, server-side logout revocation, and live permission checks
  - Production startup requires exactly one administrator before the migration and at least one afterward; additional administrators remain valid
  - Exact production Origin validation for unsafe methods
  - Checked-in Nginx redirects HTTPS `www` traffic to the configured apex origin before proxying
  - Resource-specific file capability links remain separate from account authentication

✓ Retired authentication:
  - `ADMIN_PASSWORD`, shared backend/accounting passwords, browser Bearer auth, `admin_sessions`, and `accounting_sessions` are removed
  - Legacy localStorage session keys are deleted once for migration only and never authorize a request
  - Existing administrators are discovered by database permission; no username is hard-coded

✓ Static file serving:
  - SPA fallback (serves index.html for non-existent routes)
  - Assets directory support

✓ Response handling:
  - Authentication and management responses use explicit `401`, `403`, `409`, and `429` status boundaries
  - Authenticated responses are private and not cached
  - Multipart form parsing for file uploads

## File Structure

```
server/
├── index.mjs                 (Hono app entry)
├── routes/                   (route handlers)
│   ├── admin.mjs
│   ├── posts.mjs
│   ├── users.mjs
│   ├── accounting.mjs
│   ├── files.mjs
│   ├── folders.mjs
│   ├── images.mjs
│   ├── about.mjs
│   └── revisions.mjs
├── middleware/               (authentication, Origin, and static middleware)
│   ├── auth.mjs
│   ├── origin.mjs
│   └── static.mjs
├── migrations/
│   └── adminAuthMigration.mjs
├── passwords.mjs
├── sessionCookie.mjs
├── utils/                    (utilities)
│   └── multipart.mjs
└── [domain stores and services]
```

## Verification

The unified-auth implementation is complete in the repository. Fresh local verification on 2026-07-15 produced:

- `npm test -- --run`: 87 test files and 656 tests passed.
- `npm run build`: TypeScript and the Vite production build passed.
- Removed-auth residue review: no shared-password, Bearer, `adminToken`, or `accountingToken` authorization remains in production runtime code. Remaining strings are migration cleanup, one-time frontend localStorage cleanup, negative tests, and documentation.
- Temporary production-server smoke: anonymous `401`, reader `403`, administrator `200`, cross-site write `403`, same-site write `200`, no-Cookie `/me` `401`, old Bearer-only request `401`, and logout Cookie replay `401`. The child exited with code 0, emitted no `UV_HANDLE_CLOSING`, and released the temporary database for reopen and deletion.

No production database or VPS was used for these checks.

## Next Steps

1. Follow `docs/admin-auth-deployment.md` and stop the service before touching the production database.
2. Resolve the service's real `POST_DB_PATH` and require exactly one row from `SELECT id, username, nickname FROM users WHERE permission = 'admin';`.
3. Create and hash a paired application/database backup before the new process can run migrations.
4. Deploy matching frontend and backend code, then run the documented Cookie, Origin, role, retired-token, and logout checks.

The VPS deployment has not been executed as part of the local authentication implementation task.

## Environment Variables

- `PORT` - Server port (default: 3000)
- `HOST` - Server host (default: 127.0.0.1)
- `NODE_ENV=production` - Required for the production Cookie and startup preconditions
- `SITE_URL=https://kitepop.top` - Required exact production origin
- `TRUST_PROXY=1` - Trust the checked-in local Nginx proxy for forwarded client information
- `POST_DB_PATH` - SQLite database path (default: ./data/blog.sqlite)
- `UPLOAD_DIR` - File upload directory (default: ./data/uploads)
- `IMAGE_DIR` - Image directory (default: ./data/images)
- `FILE_UPLOAD_LIMIT` - File upload limit in bytes (`0` means no application-level byte limit)
- `IMAGE_UPLOAD_LIMIT` - Image upload limit in bytes (`0` means no application-level byte limit)
