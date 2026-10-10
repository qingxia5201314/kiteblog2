import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const appCss = readFileSync(resolve(process.cwd(), 'src/App.css'), 'utf8');

describe('article detail layout CSS', () => {
  it('caps inline article images on desktop reading pages', () => {
    expect(appCss).toContain('Article detail image containment');
    expect(appCss).toMatch(/\.article-body \.article-image\s*{[\s\S]*max-width: min\(100%, 860px\)/);
    expect(appCss).toMatch(/\.article-body \.article-image img\s*{[\s\S]*max-height: min\(72vh, 720px\)/);
  });

  it('keeps the article detail page constrained to the phone viewport', () => {
    expect(appCss).toContain('Article detail mobile containment');
    expect(appCss).toMatch(/@media \(max-width: 620px\)[\s\S]*\.article-page\s*{[\s\S]*max-width: calc\(100vw - 20px\)/);
    expect(appCss).toMatch(/@media \(max-width: 620px\)[\s\S]*\.article-page-shell\s*{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(appCss).toMatch(/@media \(max-width: 620px\)[\s\S]*\.article-header-card\s*{[\s\S]*grid-template-columns: minmax\(0, 1fr\)/);
    expect(appCss).toMatch(/@media \(max-width: 620px\)[\s\S]*\.article-body\s*{[\s\S]*overflow-wrap: anywhere/);
  });

  it('removes the fixed character background on phone pages', () => {
    expect(appCss).toMatch(/@media \(max-width: 620px\)[\s\S]*body\s*{[\s\S]*background:[\s\S]*#fffdf9/);
  });
});
