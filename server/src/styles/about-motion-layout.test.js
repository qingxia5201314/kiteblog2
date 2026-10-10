import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const aboutCss = readFileSync(resolve(process.cwd(), 'src/styles/pages/about.css'), 'utf8');
const backToTopCss = readFileSync(resolve(process.cwd(), 'src/styles/features/back-to-top.css'), 'utf8');

function keyframes(name) {
  const start = aboutCss.indexOf(`@keyframes ${name}`);
  expect(start).toBeGreaterThanOrEqual(0);
  const bodyStart = aboutCss.indexOf('{', start);
  let depth = 0;
  for (let index = bodyStart; index < aboutCss.length; index += 1) {
    if (aboutCss[index] === '{') depth += 1;
    if (aboutCss[index] === '}') depth -= 1;
    if (depth === 0) return aboutCss.slice(start, index + 1);
  }
  throw new Error(`Unclosed keyframes: ${name}`);
}

describe('about motion and mobile floating controls CSS', () => {
  it('keeps avatar pulse keyframes on compositor-friendly opacity and transform properties', () => {
    const pulse = keyframes('about-avatar-pulse');
    expect(pulse).not.toMatch(/box-shadow\s*:/);
    expect(pulse).toMatch(/(?:opacity|transform)\s*:/);
  });

  it('raises back-to-top only when a mobile article TOC exists and preserves the safe area', () => {
    const mobileRule = backToTopCss.match(/@media \(max-width: 620px\)\s*{\s*\.back-to-top\s*{([^}]*)}/);
    const tocRule = backToTopCss.match(/@media \(max-width: 900px\)\s*{\s*\.app-shell:has\(\.mobile-article-toc\) \.back-to-top\s*{([^}]*)}/);

    expect(mobileRule?.[1]).toMatch(/bottom:\s*calc\(14px \+ env\(safe-area-inset-bottom, 0px\)\)/);
    expect(tocRule?.[1]).toMatch(/bottom:\s*calc\(84px \+ env\(safe-area-inset-bottom, 0px\)\)/);
    expect(backToTopCss.indexOf(tocRule?.[0] ?? '')).toBeGreaterThan(
      backToTopCss.indexOf(mobileRule?.[0] ?? '')
    );
  });

  it('separates avatar parallax transforms from ring entrance animation', () => {
    const parallaxRule = aboutCss.match(/\.about-avatar-parallax\s*{([^}]*)}/)?.[1] ?? '';
    const ringRule = aboutCss.match(/\.about-avatar-ring\s*{([^}]*)}/)?.[1] ?? '';
    expect(parallaxRule).toMatch(/transform:\s*translate/);
    expect(parallaxRule).not.toMatch(/animation\s*:/);
    expect(ringRule).toMatch(/animation:\s*about-stagger-in/);
    expect(ringRule).not.toMatch(/--about-parallax/);
  });

  it('fully disables About animations when reduced motion is requested', () => {
    const reducedStart = aboutCss.indexOf('@media (prefers-reduced-motion: reduce)');
    expect(reducedStart).toBeGreaterThanOrEqual(0);
    const reducedEnd = aboutCss.indexOf('/* About editor:', reducedStart);
    const reducedMotion = aboutCss.slice(reducedStart, reducedEnd);
    for (const selector of [
      '.about-hero::before',
      '.about-sos-watermark',
      '.about-avatar-ring',
      '.about-avatar-ring::before',
      '.about-avatar-ring::after',
      '.about-profile-name',
      '.about-identity-tags',
      '.about-hero > p',
      '.about-social-link',
      '.about-reveal'
    ]) {
      const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      expect(reducedMotion, `${selector} must disable animation`).toMatch(
        new RegExp(`${escaped}[\\s\\S]*?animation:\\s*none\\s*!important`)
      );
    }
    expect(reducedMotion).toMatch(/transition:\s*none\s*!important/);
  });

  it('keeps all core profile content visible after reduced-motion animations are removed', () => {
    const reducedStart = aboutCss.indexOf('@media (prefers-reduced-motion: reduce)');
    const reducedEnd = aboutCss.indexOf('/* About editor:', reducedStart);
    const reducedMotion = aboutCss.slice(reducedStart, reducedEnd);
    for (const selector of [
      '.about-profile-name',
      '.about-identity-tags',
      '.about-hero > p',
      '.about-social-link',
      '.about-reveal',
      '.about-avatar-ring',
      '.about-avatar-parallax'
    ]) {
      const matchingBodies = [...reducedMotion.matchAll(/([^{}]+)\{([^{}]*)}/g)]
        .filter((match) => match[1].split(',').map((item) => item.trim()).includes(selector))
        .map((match) => match[2]);
      expect(matchingBodies, `${selector} must have a reduced-motion rule`).not.toHaveLength(0);
      expect(matchingBodies.some((body) => /opacity:\s*1\s*!important/.test(body)
        && /transform:\s*none\s*!important/.test(body)), `${selector} must remain visible`).toBe(true);
    }
  });
});
