import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const stylesIndex = readFileSync(resolve(root, 'src/styles/index.css'), 'utf8');
const mobileUnlockCss = readFileSync(
  resolve(root, 'src/styles/features/mobile-unlock.css'),
  'utf8'
);

function blockAfter(source, marker) {
  const markerStart = source.indexOf(marker);
  expect(markerStart, `${marker} must exist`).toBeGreaterThanOrEqual(0);

  const bodyStart = source.indexOf('{', markerStart);
  expect(bodyStart, `${marker} must open a block`).toBeGreaterThan(markerStart);

  let depth = 0;
  for (let index = bodyStart; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] === '}') depth -= 1;
    if (depth === 0) return source.slice(bodyStart + 1, index);
  }

  throw new Error(`Unclosed CSS block after ${marker}`);
}

function expectRule(css, selector, declarations) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const body = css.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';

  expect(body, `${selector} must have a CSS rule`).not.toBe('');
  for (const declaration of declarations) {
    expect(body, `${selector} must contain ${declaration.source}`).toMatch(declaration);
  }
}

describe('shared mobile unlock layout', () => {
  it('is shared by the account gate around all four management pages', () => {
    const appSource = readFileSync(resolve(root, 'src/App.tsx'), 'utf8');
    const gateSource = readFileSync(resolve(root, 'src/components/auth/AdminAccessGate.tsx'), 'utf8');
    expect(gateSource).toContain('className="unlock-panel"');

    for (const route of ['/admin', '/files', '/images', '/accounting']) {
      expect(appSource, `${route} must be account-gated`).toMatch(
        new RegExp(`path="${route}" element=\\{<AdminAccessGate>`)
      );
    }
    for (const page of ['AdminPage.tsx', 'FilesPage.tsx', 'ImagesPage.tsx', 'AccountingPage.tsx']) {
      const source = readFileSync(resolve(root, 'src/pages', page), 'utf8');
      expect(source, `${page} must not add a second password form`).not.toContain('className="unlock-panel"');
    }
  });

  it('fits the unlock panel and controls within phone viewports', () => {
    const phoneCss = blockAfter(mobileUnlockCss, '@media (max-width: 720px)');

    expectRule(phoneCss, '.unlock-panel', [
      /display:\s*flex/,
      /flex-direction:\s*column/,
      /align-items:\s*stretch/,
      /justify-content:\s*flex-start/,
      /box-sizing:\s*border-box/,
      /margin:\s*clamp\(28px,\s*9vh,\s*72px\) auto/,
      /max-width:\s*calc\(100vw - 24px\)/,
      /min-width:\s*0/,
      /padding:\s*24px 18px/,
      /width:\s*min\(100%,\s*520px\)/
    ]);
    expectRule(phoneCss, '.unlock-panel h1', [
      /font-size:\s*clamp\(1\.75rem,\s*8vw,\s*2\.35rem\)/,
      /line-height:\s*1\.08/
    ]);
    expectRule(phoneCss, '.unlock-panel p', [
      /line-height:\s*1\.7/,
      /max-width:\s*38rem/
    ]);

    const controls = phoneCss.match(
      /\.unlock-panel input\s*,\s*\.unlock-panel button\s*\{([^}]*)\}/
    )?.[1] ?? '';
    expect(controls, 'unlock inputs and buttons must share a mobile rule').not.toBe('');
    expect(controls).toMatch(/box-sizing:\s*border-box/);
    expect(controls).toMatch(/min-height:\s*48px/);
    expect(controls).toMatch(/min-width:\s*0/);
    expect(controls).toMatch(/width:\s*100%/);
  });

  it('loads the mobile override after the legacy App stylesheet', () => {
    const legacyImport = stylesIndex.indexOf("@import '../App.css';");
    const mobileImport = stylesIndex.indexOf("@import './features/mobile-unlock.css';");

    expect(legacyImport).toBeGreaterThanOrEqual(0);
    expect(mobileImport).toBeGreaterThan(legacyImport);
  });
});
