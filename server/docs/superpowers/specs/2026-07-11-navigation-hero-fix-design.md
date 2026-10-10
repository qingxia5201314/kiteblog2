# Navigation And Hero Fix Design

## Goal

Restore a useful, restrained top navigation and render the Haruhi hero character without a clipped head or corrupted image regions.

## Navigation

- Keep only `首页` plus the existing authenticated `工具` menu.
- When no authenticated session exists, keep the existing `登录` entry in place of `工具`.
- Remove `文章`, `分类`, `专题`, and `关于` from the top navigation.
- Keep category, date, search, and tag controls inside the article index where they have visible state and results.
- Remove the low-value homepage `关于` section.

## Hero Character

- Replace the damaged `haruhi-cutout.webp` runtime asset with the clean transparent `haruhi-cutout.png` already stored in the repository.
- Preserve the current Haruhi card decoration and soft lower fade.
- Fit the complete character inside a stable desktop card with visible space above the hair. Do not use a scale or translation that crops the head.
- On mobile, keep the character on the right side without covering the title or primary actions, and keep the head inside the hero bounds.

## Verification

- Add a regression test proving the redundant navigation items and homepage about section are absent.
- Add a regression assertion proving the hero uses the clean PNG asset.
- Run the full Vitest suite and production build.
- Capture desktop and mobile screenshots and inspect the character head, hand, body edge, navigation spacing, and horizontal overflow.
- Push the verified change and deploy it to the current VPS using the existing backup and health-check workflow.
