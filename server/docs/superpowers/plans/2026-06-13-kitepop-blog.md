# Kitepop Blog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a functional Kitepop personal blog with frontend reading views and a local admin publishing workflow.

**Architecture:** Use a Vite React TypeScript SPA. Keep content types and pure helpers in `src/lib/blog.ts`, local persistence in `src/lib/blogStore.ts`, and application UI in `src/App.tsx` with styles in `src/App.css`.

**Tech Stack:** Vite, React, TypeScript, Vitest, localStorage.

---

## File Structure

- `package.json`: scripts and dependencies.
- `index.html`: app entry HTML.
- `src/main.tsx`: React bootstrap.
- `src/App.tsx`: frontend views and admin workflow.
- `src/App.css`: responsive visual design.
- `src/lib/blog.ts`: category metadata, sample posts, slug/read-time helpers.
- `src/lib/blogStore.ts`: localStorage repository functions.
- `src/lib/imageUrl.ts`: safe image URL normalization for covers and Markdown-rendered images.
- `src/lib/draftAutosave.ts`: local editor draft persistence.
- `src/lib/markdown.ts`: testable Markdown block parsing for preview and article rendering.
- `src/lib/blog.test.ts`: pure content model tests.
- `src/lib/blogStore.test.ts`: local persistence tests.

## Tasks

### Task 1: Project Skeleton And Tests

- [ ] Create Vite/React/TypeScript config files and package scripts.
- [ ] Write failing tests for slug creation, reading time, post filtering, and local repository mutations.
- [ ] Run `npm test -- --run` and verify failure because implementation files do not exist.

### Task 2: Blog Model And Store

- [ ] Implement category definitions, sample posts, slug helpers, reading-time helpers, and filter helpers.
- [ ] Implement localStorage repository with seed, create, update, delete, and publish status support.
- [ ] Run `npm test -- --run` and verify tests pass.

### Task 3: UI And Admin

- [ ] Implement homepage, category filters, article detail view, admin unlock, article list, editor form, delete and publish/draft controls.
- [ ] Implement responsive styling and visual assets through CSS cover imagery.
- [ ] Run `npm run build` and verify production build succeeds.

### Task 4: Local Run

- [ ] Start a dev server with `npm run dev -- --host 127.0.0.1`.
- [ ] Report the local URL and verification results.

### Task 5: Image Publishing Workflow

- [ ] Add tests for safe image URL normalization and draft autosave.
- [ ] Add `coverImage` support to the post model.
- [ ] Add Markdown image rendering and cover image URL support.
- [ ] Add editor preview, autosaved new draft, status filter, delete confirmation, and visible validation messages.
- [ ] Run tests and production build before committing.

### Task 6: Markdown Editor

- [ ] Add tests for Markdown headings, blockquotes, lists, fenced code, and images.
- [ ] Replace ad hoc Markdown preview parsing with `src/lib/markdown.ts`.
- [ ] Add Markdown toolbar actions for headings, bold, inline code, blockquote, lists, links, and code blocks.
- [ ] Run tests and production build before committing and pushing to GitHub.
