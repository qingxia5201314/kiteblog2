import { describe, expect, it } from 'vitest';
import { renderMathToHtml } from './math';

describe('math renderer', () => {
  it('renders inline and display formulas with KaTeX markup', () => {
    expect(renderMathToHtml('E = mc^2', false)).toContain('katex');
    expect(renderMathToHtml('\\frac{1}{2}', true)).toContain('katex-display');
  });

  it('keeps invalid formulas non-fatal', () => {
    expect(() => renderMathToHtml('\\invalid{', false)).not.toThrow();
    expect(renderMathToHtml('\\invalid{', false)).toContain('katex-error');
  });
});
