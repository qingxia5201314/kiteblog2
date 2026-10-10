import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const homeCss = readFileSync(resolve(process.cwd(), 'src/styles/pages/home.css'), 'utf8');

function ruleBodies(selector, css = homeCss) {
  const escapedSelector = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return [...css.matchAll(new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`, 'g'))]
    .map((match) => match[1]);
}

function expectRule(selector, declarations, css = homeCss) {
  const bodies = ruleBodies(selector, css);
  expect(bodies, `${selector} must have a CSS rule`).not.toHaveLength(0);
  expect(
    bodies.some((body) => declarations.every((declaration) => declaration.test(body))),
    `${selector} must contain ${declarations.map((declaration) => declaration.source).join(' and ')}`
  ).toBe(true);
}

describe('home filter stacking CSS', () => {
  it('keeps the filter panel above results without overriding its sticky behavior', () => {
    const fixStart = homeCss.indexOf('Home filter stacking fix');
    expect(fixStart).toBeGreaterThanOrEqual(0);
    const stackingFix = homeCss.slice(fixStart);
    const filterPanelFix = ruleBodies('.home-filter-panel', stackingFix)[0] ?? '';
    const desktopRule = ruleBodies('.home-filter-panel')[0] ?? '';
    const tabletRule = homeCss.match(
      /@media \(min-width: 640px\) and \(max-width: 860px\)\s*\{[\s\S]*?\.home-filter-panel\s*\{([^}]*)}/
    )?.[1] ?? '';

    expectRule('.home-filter-panel', [/overflow:\s*visible/, /z-index:\s*3/], stackingFix);
    expect(filterPanelFix).not.toMatch(/position\s*:/);
    expect(desktopRule).toMatch(/position:\s*sticky/);
    expect(desktopRule).toMatch(/top:\s*92px/);
    expect(tabletRule).toMatch(/position:\s*sticky/);
    expect(tabletRule).toMatch(/top:\s*88px/);
    expectRule('.home-post-panel', [/position:\s*relative/, /z-index:\s*1/], stackingFix);
  });

  it('raises the open filter and its floating menu', () => {
    expectRule('.index-filters .filter-menu[open]', [/z-index:\s*40/]);
    expectRule('.index-filters .filter-menu > div', [/z-index:\s*41/]);
  });
});
