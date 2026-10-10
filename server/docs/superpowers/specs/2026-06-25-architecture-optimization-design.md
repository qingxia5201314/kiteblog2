# Website Architecture Optimization Design

## Goal

Improve the blog's frontend and backend architecture so the site is easier to maintain and extend without breaking current business behavior. The optimized system must keep article, admin, image-hosting, file-storage, and accounting flows working on the website, preserve existing data, and remain deployable to the current VPS.

## Scope

This design covers:

- Frontend state and data-loading boundaries
- Admin page decomposition
- Route-level performance optimization
- Backend service/storage layering
- Controlled data migration support when schema changes are truly needed

This design does not include:

- Replacing SQLite in this round
- Changing the visual style or content model on purpose
- Rewriting the backend into a new framework
- Moving production hosting away from the current VPS

## Current Problems

### Shared state is too broad

`src/context/AppContext.tsx` currently mixes notification state, admin session restoration, user session restoration, and article loading. This creates hidden coupling between unrelated modules and makes "restored session should auto-load its data" behavior easy to implement inconsistently.

### Page modules repeat session and loading behavior

`AdminPage`, `ImagesPage`, `FilesPage`, and `AccountingPage` each manage part of their own session recovery or data fetch timing. This duplication has already caused bugs where data only appears after refresh or after a second user action.

### Admin page responsibilities are too concentrated

`src/pages/AdminPage.tsx` currently owns article listing, user management, article editing, image upload interactions, local draft restore, and Markdown tooling. This makes targeted fixes risky and makes it harder to test isolated backend-management behaviors.

### Frontend code is loaded too eagerly

The current Vite build shows a large main JavaScript bundle. Public homepage visitors pay for admin, file, image, accounting, and KaTeX/editor code even when they never visit those routes.

### Backend route/store boundaries are still shallow

The backend already has route files and store files, but business rules and storage assumptions are still close together. That makes future schema changes or storage backends harder to introduce safely.

## Target Architecture

### Frontend data layer

Introduce dedicated module-level controllers so each domain owns its own session-dependent data loading rules:

- App-level shell state: notifications, current user session, admin session entry points
- Blog data controller: article list loading, draft visibility rules, article refresh behavior
- Image data controller: hosted image list and upload/remove refresh
- File data controller: folder navigation, file list loading, signed-link generation refresh
- Accounting data controller: accounting session, month data loading, settings refresh

The key rule is: session restoration and token-driven auto-load behavior must live in the data layer, not be recreated in each page component.

### AppContext responsibilities

`AppContext` will be reduced to truly global concerns:

- notification state
- admin session state and setters
- user session state and setters

It will no longer be the single place responsible for every feature's data fetch lifecycle. Feature data should move into dedicated hooks or providers.

### Admin feature decomposition

Split the admin experience into focused components:

- `ArticleManager`: article list, filters, publish/draft toggle, delete/edit entry points
- `EditorPanel`: article form, cover upload, Markdown editing, preview, draft autosave
- `UserManager`: admin user list, create/update/delete user flows

These components can stay under the existing admin route and preserve the existing UI behavior, but their logic should no longer live in one large file.

### Route loading strategy

Apply route-level lazy loading to:

- `/admin`
- `/files`
- `/images`
- `/accounting`

Keep the homepage route as the lightest path. Admin/editor-specific code, accounting logic, and heavy rendering dependencies should not block the initial public route.

KaTeX should remain supported, but editor-specific or admin-only logic should not be bundled into the homepage path unless it is directly required there.

### Backend layering

Introduce a clearer backend flow:

- Route layer: parse request, validate required request shape, map errors to HTTP responses
- Service layer: business operations, permission checks, orchestration
- Storage layer: SQLite queries, file/image persistence, path generation

This should be applied incrementally without changing the exposed API contract unless necessary.

### Storage abstraction

Keep SQLite and local disk support as the working production default, but introduce stable interfaces around:

- article persistence
- admin/user persistence
- file metadata and file path persistence
- image metadata and image path persistence
- signed file-link generation
- cleanup/delete behavior

This creates a controlled seam for future moves to PostgreSQL, S3/OSS/R2, or other file backends without forcing this round to perform that migration.

## Data Safety and Migration Rules

### Default policy

Do not change production data structures unless the optimization cannot be completed safely without it.

### If a schema change becomes necessary

The implementation must include:

- an explicit migration script or idempotent upgrade path
- backward-safe loading for existing records during rollout
- a tested rollback point
- verification that article data, file metadata, image metadata, user data, and accounting data still load correctly

### Business continuity requirement

At no point should the deployed site lose the ability to:

- list public posts
- restore admin access
- load draft posts in admin
- load hosted images
- load file folders and files
- access accounting data after accounting login

## Testing and Verification Requirements

### Frontend verification

- Existing route shells still render
- Restored admin session auto-loads article drafts, images, files, and user list
- Accounting session still loads month data correctly
- Admin editor preview and content editing remain usable
- Page layout and typography remain visually intact after component decomposition and lazy loading

### Backend verification

- `/api/posts`, `/api/admin/*`, `/api/files/*`, `/api/images/*`, `/api/accounting/*` still respond with current expected behavior
- File and image metadata remain linked to the database
- Existing stored uploads remain readable from their current paths
- Delete flows still remove the correct database rows and files

### Deployment verification

Before completion claims:

- targeted tests for each changed domain
- build passes
- after deployment, verify homepage, post API, file/image API, and backend service health on the VPS

## Recommended Implementation Order

1. Extract frontend data-loading responsibilities out of `AppContext` and page-local duplicated loaders.
2. Decompose `AdminPage` into focused components while preserving current behavior.
3. Add route-level lazy loading and keep homepage path minimal.
4. Introduce backend service/storage seams without changing current API behavior.
5. Only add schema migration work if a later step proves it is required.

## Expected Results

After implementation:

- session-restoration behavior becomes consistent across admin, images, files, and accounting
- business pages become less coupled and easier to change safely
- homepage payload becomes smaller and faster to load
- admin architecture becomes easier to test and maintain
- file/image database linkage remains stable while future storage replacement becomes much easier
