# UI Motion Structure Design

## Goal

Give Kitepop Blog a cleaner visual system, controlled 3D depth, and smoother page motion while keeping the existing blog, admin, accounting, file, image, media, login, and comment features working.

## Scope

This design is limited to the front-end presentation layer.

- Do not change SQLite schemas.
- Do not change `/api/*` routes.
- Do not change auth token formats, localStorage keys, or backend session logic.
- Do not change post, comment, accounting, file, or image data contracts.
- Do not replace the current React/Vite stack.
- Do not introduce full-page heavy WebGL as a required runtime dependency.

## Visual Direction

The home and article pages carry the Haruhi-inspired identity. The tool pages keep a calmer product feel.

- Home hero: layered poster composition with soft perspective, character depth, and restrained parallax.
- Article list: scannable cards with cover, title, category, tags, time, and hover lift.
- Article detail: stronger reading hierarchy, clearer comment area, and softer section transitions.
- Admin, accounting, files, images, and media preview: unified control-panel language with consistent panels, buttons, fields, empty states, and status chips.

The result should feel more dimensional and polished, not flashy.

## Motion Rules

Motion is limited to four families:

1. Page entrance: opacity and small vertical offset.
2. Hover feedback: lift, shadow, border emphasis, and very light 3D tilt where appropriate.
3. State changes: filter menus, collapsible admin groups, comments, and toasts use the same duration and easing.
4. Decorative effects: pointer particles and hero parallax stay subtle and degrade cleanly.

`prefers-reduced-motion` must disable large movement, rotation, particles, and floating effects while keeping essential opacity changes.

## File Structure

The current `src/App.css` is too large to safely keep expanding. The UI work should create a clear front-end styling structure:

```text
src/styles/
  index.css
  tokens.css
  base.css
  layout.css
  motion.css
  effects.css
  pages/
    home.css
    article.css
    admin.css
    accounting.css
    files.css
    images.css
    media.css

src/components/ui/
  Button.tsx
  Panel.tsx
  Badge.tsx
  EmptyState.tsx
  SectionHeader.tsx

src/components/effects/
  PointerParticles.tsx
  ParallaxStage.tsx
  TiltCard.tsx

src/features/blog/
  BlogHero.tsx
  ArticleCard.tsx
  ArticleFilterPanel.tsx
  CommentPanel.tsx
```

The first implementation phase should only split and import styles without visual behavior changes. Component extraction and effects come after that baseline is verified.

## Rollout Strategy

### Phase 1: Style Structure Baseline

Create the style folder structure and move logically grouped CSS out of `App.css` while keeping selectors and rendered output stable. This phase must not change UI behavior or business logic.

### Phase 2: Shared UI Components

Extract common presentational pieces such as panel headers, badges, empty states, and buttons. Keep the same props and behavior in page components.

### Phase 3: Home and Article Polish

Improve home hero, article cards, article detail, and comments using the shared visual system.

### Phase 4: Tool Page Unification

Apply the same panel, field, button, and state styles to admin, accounting, files, images, and media preview pages.

### Phase 5: Motion and 3D Effects

Add parallax, 3D hover, and motion utilities after the page layouts are stable. Effects must be optional CSS/React layers and must not block data loading or form controls.

## Verification Requirements

Every phase must run:

```powershell
npm test -- --run
npm run build
```

Important regression points:

- Public registration/login still works.
- Article comments still load from the backend.
- Admin article CRUD still works.
- Admin user management still loads.
- Accounting month data still loads.
- File and image lists still auto-load with saved admin sessions.
- File/image upload UI remains clickable.
- Media preview still loads the player.
- Mobile home, article, admin, accounting, files, and images pages have no horizontal overflow.

## Success Criteria

- Source files are easier to find and change by page or concern.
- `App.css` no longer acts as the single long-term dumping ground for all UI.
- The site visibly gains depth and smoother interaction.
- Existing data-backed features keep their current contracts and persistence.
- The first phase can be reverted without touching backend code or database files.
