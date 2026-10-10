# Markdown Math Support Design

## Goal

Add LaTeX-style mathematical formula support to blog Markdown while keeping the existing editor, article storage format, and Markdown rendering flow.

## Supported Syntax

- Inline formula: `$E = mc^2$`
- Display formula:

  ```md
  $$
  \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}
  $$
  ```

- Escaped dollar signs such as `\$100` remain normal text.
- Dollar signs inside inline code and fenced code blocks are not parsed as formulas.

## Rendering Approach

Use KaTeX as the formula rendering engine.

The existing Markdown parser remains responsible for headings, paragraphs, lists, code blocks, images, and blockquotes. It will gain a display-math block type for `$$...$$`. Inline Markdown rendering will recognize `$...$` and render it through the same KaTeX helper.

Both admin preview and published article detail already use the shared `renderMarkdown` function. Formula support will be implemented in that shared path so both views produce identical output.

## Editor Changes

- Add an inline-formula toolbar button that inserts `$公式$`.
- Add a display-formula toolbar button that inserts:

  ```md
  $$
  公式
  $$
  ```

- Update the editor placeholder to mention mathematical formulas.
- Keep formula source as plain Markdown text in the database. No database migration or API change is required.

## Error Handling

KaTeX will use non-throwing rendering. Invalid LaTeX will remain visible as formula source with an error style instead of crashing the editor preview or article page.

## Styling

- Inline formulas align with surrounding text and inherit readable foreground color.
- Display formulas use a full-width, horizontally scrollable container so long expressions do not overflow on mobile.
- Formula colors and borders follow the existing light SOS theme.

## Testing

- Markdown parser recognizes multi-line `$$...$$` blocks.
- Inline renderer recognizes `$...$`.
- Escaped dollar signs and code spans remain unchanged.
- Invalid formulas render without throwing.
- Admin preview and article detail continue to use the shared renderer.
- Run the full test suite and production build.

## Out of Scope

- Equation numbering and cross-references.
- MathJax.
- Custom LaTeX macros.
- Server-side formula rendering.
- Replacing the existing Markdown parser with a new Markdown framework.
