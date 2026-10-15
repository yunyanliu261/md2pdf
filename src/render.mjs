// Markdown -> standalone HTML document (Node only: assets are file:// URLs).
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createMarkdown, escapeHtml, firstHeading, PRINT_CSS } from './markdown.mjs';

export { githubSlug, createMarkdown } from './markdown.mjs';

const require = createRequire(import.meta.url);
const asset = (spec) => pathToFileURL(require.resolve(spec)).href;

export const ASSETS = {
  css: {
    light: asset('github-markdown-css/github-markdown-light.css'),
    dark: asset('github-markdown-css/github-markdown-dark.css'),
  },
  hljs: {
    light: asset('highlight.js/styles/github.css'),
    dark: asset('highlight.js/styles/github-dark.css'),
  },
  katexCss: asset('katex/dist/katex.min.css'),
  mermaidJs: asset('mermaid/dist/mermaid.min.js'),
};

/**
 * @param {string} markdown
 * @param {{ baseDir?: string, title?: string, theme?: 'light'|'dark' }} [opts]
 */
export function renderHtml(markdown, opts = {}) {
  const theme = opts.theme === 'dark' ? 'dark' : 'light';
  const body = createMarkdown().render(markdown);
  const title = opts.title ?? firstHeading(markdown) ?? 'Document';
  const baseHref = opts.baseDir ? pathToFileURL(path.resolve(opts.baseDir) + path.sep).href : null;
  const bg = theme === 'dark' ? '#0d1117' : '#ffffff';
  const hasMermaid = body.includes('class="mermaid"');

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
${baseHref ? `<base href="${escapeHtml(baseHref)}">` : ''}
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="${ASSETS.css[theme]}">
<link rel="stylesheet" href="${ASSETS.hljs[theme]}">
<link rel="stylesheet" href="${ASSETS.katexCss}">
<style>html, body { margin: 0; padding: 0; background: ${bg}; }${PRINT_CSS}</style>
</head>
<body>
<article class="markdown-body">
${body}
</article>
${
  hasMermaid
    ? `<script src="${ASSETS.mermaidJs}"></script>
<script>
  mermaid.initialize({ startOnLoad: false, theme: ${JSON.stringify(theme === 'dark' ? 'dark' : 'default')} });
  window.__md2pdfMermaid = mermaid.run({ querySelector: 'pre.mermaid' });
</script>`
    : ''
}
</body>
</html>
`;
}
