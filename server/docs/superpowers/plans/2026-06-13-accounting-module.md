# Kitepop Accounting Module Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an authenticated, persistent accounting module with entries, monthly stats, budgets, and one-month saving goals.

**Architecture:** Reuse the existing Node HTTP server, admin password verification, React SPA, and SQLite-backed `sql.js` database file. Add focused accounting model/store/session/API modules, then add a top-level Accounting view in `src/App.tsx`.

**Tech Stack:** Vite, React, TypeScript, Vitest, Node HTTP, sql.js SQLite.

---

## File Structure

- Create `server/accountingModel.mjs`: pure date, money, summary, budget, and saving-goal helpers.
- Create `server/accountingSession.mjs`: 30-day accounting sessions with hashed tokens.
- Create `server/accountingStore.mjs`: SQLite schema and persistence for sessions, entries, settings.
- Create `server/accountingStore.test.mjs`: server tests for auth, CRUD, summaries, settings.
- Create `src/lib/accounting.ts`: frontend types, category metadata, formatting helpers.
- Create `src/lib/accountingApi.ts`: fetch wrapper for `/api/accounting`.
- Create `src/lib/accountingApi.test.ts`: verifies URLs, methods, and bearer token headers.
- Modify `server/index.mjs`: initialize accounting store and route `/api/accounting`.
- Modify `src/App.tsx`: add `accounting` mode, token persistence, login panel, dashboard, entry form, filters, list, saving target settings.
- Modify `src/App.css`: add accounting-specific layout and visual elements matching the existing site.
- Modify docs spec/plan as implementation changes settle.

## Tasks

### Task 1: Server Accounting Model

- [ ] Write failing tests in `server/accountingStore.test.mjs` for monthly summary, entry CRUD, and saving goal math.
- [ ] Run `npm test -- server/accountingStore.test.mjs --run` and verify failure because modules do not exist.
- [ ] Implement `server/accountingModel.mjs` and `server/accountingStore.mjs` with SQLite tables.
- [ ] Run the accounting store test and verify it passes.

### Task 2: 30-Day Accounting Session

- [ ] Add failing tests for login token hashing, 30-day expiry, and invalid token rejection.
- [ ] Run the focused test and verify failure.
- [ ] Implement `server/accountingSession.mjs` and connect it to `accountingStore`.
- [ ] Run the focused test and verify it passes.

### Task 3: HTTP API

- [ ] Add accounting routes to `server/index.mjs`: login, session check, entries CRUD, settings get/update.
- [ ] Ensure every non-login route requires accounting bearer token.
- [ ] Keep request bodies within the existing server body limit.
- [ ] Run server tests and an HTTP smoke test with a temporary database.

### Task 4: Frontend API And Types

- [ ] Write failing tests in `src/lib/accountingApi.test.ts` for login, list entries, create entry, update settings, and bearer token headers.
- [ ] Run focused test and verify failure.
- [ ] Implement `src/lib/accounting.ts` and `src/lib/accountingApi.ts`.
- [ ] Run focused test and verify it passes.

### Task 5: React Accounting View

- [ ] Add top-level `accounting` mode and nav button in `src/App.tsx`.
- [ ] Add localStorage-backed `accountingToken` with server validation on page load.
- [ ] Add login panel for unauthenticated users.
- [ ] Add dashboard cards, quick entry form, filters, entry list, edit/delete actions, budget panel, and one-month saving goal panel.
- [ ] Use server responses as the source of truth after every mutation.

### Task 6: Styling And UX

- [ ] Add accounting CSS with the existing color system, compact cards, segmented controls, progress bars, and clear private-state empty screens.
- [ ] Add toast feedback for login failure, session expiry, save, delete, and validation errors.
- [ ] Verify text fits on mobile and desktop.

### Task 7: Verification, Git, Deploy

- [ ] Run `npm test -- --run`.
- [ ] Run `npm run build`.
- [ ] Scan the repo for real secrets and sample finance data that should not be committed.
- [ ] Commit and push to GitHub.
- [ ] Deploy to VPS without overwriting the existing SQLite file.
- [ ] Verify online: homepage 200, `/api/posts` works, unauthenticated `/api/accounting/entries` returns 401, login succeeds, authenticated accounting summary loads.
