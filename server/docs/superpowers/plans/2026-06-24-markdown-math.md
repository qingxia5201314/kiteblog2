# Markdown Math Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Render inline and display LaTeX formulas consistently in admin Markdown preview and published articles.

**Architecture:** Extend the existing Markdown block parser with a display-math block, then add a focused KaTeX rendering helper used by the shared React Markdown renderer. Keep article content stored as plain Markdown and reuse the existing shared preview/detail rendering path.

**Tech Stack:** React 19, TypeScript, Vitest, KaTeX, existing custom Markdown parser

---

### Task 1: Add KaTeX Dependency

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`

- [x] **Step 1: Install KaTeX and its TypeScript declarations**

Run:

```powershell
npm install katex
npm install -D @types/katex
```

Expected: `katex` appears in dependencies and `@types/katex` appears in devDependencies.

- [x] **Step 2: Verify dependency resolution**

Run:

```powershell
npm run build
```

Expected: Existing application builds before formula code is introduced.

### Task 2: Parse Display Math Blocks

**Files:**
- Modify: `src/lib/markdown.ts`
- Test: `src/lib/markdown.test.ts`

- [x] **Step 1: Write failing parser tests**

Add tests requiring:

```ts
expect(parseMarkdown('$$\nE = mc^2\n$$')).toEqual([
  { type: 'math', formula: 'E = mc^2' }
]);

expect(parseMarkdown('```text\n$notMath$\n```')).toEqual([
  { type: 'code', language: 'text', code: '$notMath$' }
]);
```

- [x] **Step 2: Run parser tests and verify failure**

Run:

```powershell
npm test -- --run src/lib/markdown.test.ts
```

Expected: display-math test fails because `MarkdownBlock` has no `math` type.

- [x] **Step 3: Implement display-math parsing**

Extend `MarkdownBlock`:

```ts
| { type: 'math'; formula: string }
```

Track a `mathLines` buffer. A line containing only `$$` opens or closes a math block outside fenced code. On close, append:

```ts
blocks.push({ type: 'math', formula: mathLines.join('\n').trim() });
```

If the document ends with an unclosed math block, preserve its source as a normal paragraph instead of dropping content.

- [x] **Step 4: Run parser tests**

Run:

```powershell
npm test -- --run src/lib/markdown.test.ts
```

Expected: all Markdown parser tests pass.

### Task 3: Render Inline and Display Formulas

**Files:**
- Create: `src/lib/math.ts`
- Create: `src/lib/math.test.ts`
- Modify: `src/components/shared.tsx`
- Modify: `src/main.tsx`

- [x] **Step 1: Write failing formula helper tests**

Define the intended helper API:

```ts
renderMathToHtml('E = mc^2', false)
renderMathToHtml('\\frac{1}{2}', true)
```

Tests must assert:

```ts
expect(renderMathToHtml('E = mc^2', false)).toContain('katex');
expect(renderMathToHtml('\\frac{1}{2}', true)).toContain('katex-display');
expect(() => renderMathToHtml('\\invalid{', false)).not.toThrow();
```

- [x] **Step 2: Run helper tests and verify failure**

Run:

```powershell
npm test -- --run src/lib/math.test.ts
```

Expected: failure because `src/lib/math.ts` does not exist.

- [x] **Step 3: Implement the KaTeX helper**

Create:

```ts
import katex from 'katex';

export function renderMathToHtml(formula: string, displayMode: boolean): string {
  return katex.renderToString(formula, {
    displayMode,
    output: 'htmlAndMathml',
    strict: false,
    throwOnError: false
  });
}
```

- [x] **Step 4: Add shared React formula rendering**

In `renderInlineMarkdown`, preserve code spans first and split remaining text into `$...$` formula segments. Render formulas as:

```tsx
<span
  className="math-inline"
  dangerouslySetInnerHTML={{ __html: renderMathToHtml(formula, false) }}
/>
```

Do not treat `\$` as a delimiter. Keep links, bold, and code behavior intact.

In `renderMarkdownBlock`, add:

```tsx
if (block.type === 'math') {
  return (
    <div
      className="math-display"
      dangerouslySetInnerHTML={{ __html: renderMathToHtml(block.formula, true) }}
      key={index}
    />
  );
}
```

- [x] **Step 5: Load KaTeX base CSS once**

Add to `src/main.tsx`:

```ts
import 'katex/dist/katex.min.css';
```

- [x] **Step 6: Run formula and shared renderer tests**

Run:

```powershell
npm test -- --run src/lib/math.test.ts src/components/shared.test.tsx src/lib/markdown.test.ts
```

Expected: all targeted tests pass.

### Task 4: Add Formula Controls to the Admin Editor

**Files:**
- Modify: `src/pages/AdminPage.tsx`
- Test: `src/App.test.tsx`

- [x] **Step 1: Add failing editor toolbar test**

Render `/admin` with an existing valid admin session and assert that the toolbar contains:

```ts
host.querySelector('button[aria-label="行内公式"]')
host.querySelector('button[aria-label="块级公式"]')
```

- [x] **Step 2: Run App tests and verify failure**

Run:

```powershell
npm test -- --run src/App.test.tsx
```

Expected: formula toolbar button assertions fail.

- [x] **Step 3: Add formula insertion buttons**

Add buttons beside the existing Markdown controls:

```tsx
<button
  aria-label="行内公式"
  onClick={() => insertMarkdownSnippet('$', '$', 'E = mc^2')}
  title="行内公式"
  type="button"
>
  ∑
</button>
<button
  aria-label="块级公式"
  onClick={() => insertMarkdownSnippet('$$\n', '\n$$', '\\frac{a}{b}')}
  title="块级公式"
  type="button"
>
  ∫
</button>
```

Update the textarea placeholder to include formulas.

- [x] **Step 4: Run App tests**

Run:

```powershell
npm test -- --run src/App.test.tsx
```

Expected: all App tests pass.

### Task 5: Style Formula Output

**Files:**
- Modify: `src/App.css`

- [x] **Step 1: Add scoped formula styles**

Add:

```css
.math-inline {
  color: var(--sos-black);
  display: inline-block;
  max-width: 100%;
  vertical-align: middle;
}

.math-display {
  background: rgba(255, 253, 249, 0.78);
  border: 1px solid rgba(216, 75, 73, 0.2);
  border-radius: 8px;
  margin: 22px 0;
  overflow-x: auto;
  padding: 18px 20px;
  text-align: center;
}

.math-display .katex-display {
  margin: 0;
  min-width: max-content;
}

.katex-error {
  color: var(--sos-red);
  white-space: pre-wrap;
}
```

Use the existing responsive rules; no viewport-scaled font sizes.

- [x] **Step 2: Build for CSS and type verification**

Run:

```powershell
npm run build
```

Expected: production build succeeds and includes KaTeX font assets.

### Task 6: Full Regression and Documentation

**Files:**
- Modify: `progress.md`
- Modify: `docs/superpowers/plans/2026-06-24-markdown-math.md`

- [x] **Step 1: Run full tests**

Run:

```powershell
npm test -- --run
```

Expected: all test files pass.

- [x] **Step 2: Run production build**

Run:

```powershell
npm run build
```

Expected: TypeScript and Vite build pass.

- [x] **Step 3: Append progress log**

Record:

- supported inline/display syntax;
- shared admin/article rendering;
- formula toolbar controls;
- test/build output;
- changed file list and rollback command.

- [x] **Step 4: Mark completed plan checkboxes**

Update each completed `- [x]` to `- [x]`.

- [x] **Step 5: Commit implementation**

Run:

```powershell
git add package.json package-lock.json src/lib/markdown.ts src/lib/markdown.test.ts src/lib/math.ts src/lib/math.test.ts src/components/shared.tsx src/main.tsx src/pages/AdminPage.tsx src/App.test.tsx src/App.css docs/superpowers/plans/2026-06-24-markdown-math.md progress.md
git commit -m "Add Markdown math rendering"
```

