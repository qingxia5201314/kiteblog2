import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const accountingCss = readFileSync(resolve(root, 'src/styles/pages/accounting.css'), 'utf8');
const stylesIndex = readFileSync(resolve(root, 'src/styles/index.css'), 'utf8');

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

function ruleBody(source, selector) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return source.match(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
}

describe('accounting mobile presentation CSS', () => {
  it('loads accounting overrides exactly once after the legacy App stylesheet', () => {
    const importLine = "@import './pages/accounting.css';";
    const accountingImports = stylesIndex.match(/@import ['"]\.\/pages\/accounting\.css['"];/g) ?? [];

    expect(accountingImports).toHaveLength(1);
    expect(stylesIndex.indexOf(importLine)).toBeGreaterThan(stylesIndex.indexOf("@import '../App.css';"));
  });

  it('keeps tabs desktop-hidden and switches only mobile panel visibility', () => {
    expect(ruleBody(accountingCss, '.accounting-mobile-tabs')).toMatch(/display:\s*none/);

    const mobileCss = blockAfter(accountingCss, '@media (max-width: 720px)');
    expect(ruleBody(mobileCss, '.accounting-mobile-tabs')).toMatch(/display:\s*grid/);
    expect(ruleBody(mobileCss, ".accounting-mobile-tabs button[aria-pressed='true']")).toMatch(
      /border-bottom-color:\s*#d84b49/
    );
    const tabFocus = ruleBody(mobileCss, '.accounting-mobile-tabs button:focus-visible');
    expect(tabFocus).toMatch(/outline:\s*none/);
    expect(tabFocus).toMatch(/box-shadow:[^;]*inset/);
    expect(ruleBody(mobileCss, '[data-accounting-panel]')).toMatch(/display:\s*none/);
    expect(ruleBody(mobileCss, '[data-accounting-panel].is-mobile-active')).toMatch(/display:\s*grid/);
  });

  it('keeps the mobile accounting hero on its responsive grid instead of the legacy flex row', () => {
    const mobileCss = blockAfter(accountingCss, '@media (max-width: 720px)');
    const narrowMobileCss = blockAfter(accountingCss, '@media (max-width: 380px)');

    expect(ruleBody(mobileCss, '.accounting-hero')).toMatch(/display:\s*grid/);
    expect(ruleBody(narrowMobileCss, '.accounting-hero')).toMatch(
      /grid-template-columns:\s*minmax\(0,\s*1fr\)/
    );
  });

  it('uses the container-relative glint track and exposes the approved action selectors', () => {
    const glint = blockAfter(accountingCss, '@keyframes accounting-button-glint');

    expect(glint).toMatch(/left:\s*-20%/);
    expect(glint).toMatch(/left:\s*115%/);
    expect(glint).not.toMatch(/translateX\s*\(/);

    expect(ruleBody(accountingCss, '.accounting-page .accounting-primary-action')).toMatch(
      /background:\s*#d84b49/
    );
    expect(ruleBody(accountingCss, '.accounting-page .accounting-primary-action')).toMatch(/clip-path:/);
    expect(ruleBody(accountingCss, '.accounting-page .accounting-primary-action')).toMatch(/box-shadow:\s*none/);
    expect(ruleBody(accountingCss, '.accounting-page .accounting-secondary-action')).toMatch(
      /background:\s*#fffdf9/
    );
    expect(ruleBody(accountingCss, '.accounting-page .accounting-secondary-action')).toMatch(/clip-path:\s*none/);
    expect(ruleBody(accountingCss, '.entry-actions .entry-edit')).toMatch(/border:\s*1\.5px solid #2d231e/);
    expect(ruleBody(accountingCss, '.entry-actions .entry-edit')).toMatch(/clip-path:\s*none/);
    expect(ruleBody(accountingCss, '.entry-actions .danger')).toMatch(/border:\s*1px solid #cf4143/);
    expect(ruleBody(accountingCss, '.entry-actions .danger')).toMatch(/box-shadow:/);
  });

  it('stops the new accounting animations when reduced motion is requested', () => {
    const reducedMotionCss = blockAfter(accountingCss, '@media (prefers-reduced-motion: reduce)');

    expect(reducedMotionCss).toMatch(/\.accounting-page::before\s*,\s*\.accounting-page::after/);
    expect(ruleBody(reducedMotionCss, '.accounting-page::after')).toMatch(/animation:\s*none/);
    expect(ruleBody(reducedMotionCss, '.accounting-page .accounting-primary-action::after')).toMatch(
      /animation:\s*none/
    );
    expect(ruleBody(reducedMotionCss, '.accounting-page .accounting-primary-action::after')).toMatch(
      /opacity:\s*0/
    );
    expect(ruleBody(reducedMotionCss, '[data-accounting-panel].is-mobile-active')).toMatch(/animation:\s*none/);
  });

  it('keeps a visible high-specificity focus ring on every styled accounting action', () => {
    const focusSelectors = [
      '.accounting-card .accounting-primary-action:focus-visible',
      '.accounting-card .accounting-secondary-action:focus-visible',
      '.entry-actions .entry-edit:focus-visible',
      '.entry-actions .danger:focus-visible'
    ];

    for (const selector of focusSelectors) {
      const body = ruleBody(accountingCss, `.accounting-page ${selector}`);
      expect(body, `${selector} must define its own focus rule`).toMatch(/outline:\s*3px solid/);
      expect(body, `${selector} must offset the focus ring`).toMatch(/outline-offset:\s*3px/);
    }

    for (const selector of [focusSelectors[0], focusSelectors[3]]) {
      expect(ruleBody(accountingCss, `.accounting-page ${selector}`)).toMatch(/box-shadow:[^;]*inset/);
    }

    const pressedPrimary = ruleBody(
      accountingCss,
      '.accounting-page .accounting-card .accounting-primary-action:active:focus-visible'
    );
    expect(pressedPrimary).toMatch(/drop-shadow\(1px 2px 0 #7f2328\)/);
    expect(pressedPrimary).toMatch(/transform:\s*translate\(3px, 3px\)/);
  });
});
