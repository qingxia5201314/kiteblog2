import katex from 'katex';

export function renderMathToHtml(formula: string, displayMode: boolean): string {
  return katex.renderToString(formula, {
    displayMode,
    output: 'htmlAndMathml',
    strict: false,
    throwOnError: false
  });
}
