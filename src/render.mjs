// Markdown -> standalone HTML document that looks like GitHub's rendering.
import path from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import { full as emoji } from 'markdown-it-emoji';
import alerts from 'markdown-it-github-alerts';
import katexPlugin from '@vscode/markdown-it-katex';
import katex from 'katex';
import hljs from 'highlight.js';

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

// Same algorithm as github-slugger: lowercase, drop punctuation, spaces -> '-'.
export function githubSlug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
    .replace(/ /g, '-');
}

function escapeHtml(s) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
}

export function createMarkdown() {
  const md = new MarkdownIt({
    html: true,
    linkify: true,
    typographer: false,
    highlight(code, lang) {
      if (lang && hljs.getLanguage(lang)) {
        const out = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        return `<pre><code class="hljs language-${escapeHtml(lang)}">${out}</code></pre>`;
      }
      return '';
    },
  })
    .use(anchor, { slugify: githubSlug, tabIndex: false })
    .use(footnote)
    .use(taskLists, { enabled: false, label: true })
    .use(emoji)
    .use(alerts)
    .use(katexPlugin.default ?? katexPlugin, { throwOnError: false });

  // ```mermaid and ```math fences are rendered as diagrams / display math, like on GitHub.
  const defaultFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, options, env, self) => {
    const token = tokens[idx];
    const lang = token.info.trim().split(/\s+/)[0];
    if (lang === 'mermaid') {
      return `<pre class="mermaid">${escapeHtml(token.content)}</pre>\n`;
    }
    if (lang === 'math') {
      return `<div class="math-display">${katex.renderToString(token.content, {
        displayMode: true,
        throwOnError: false,
      })}</div>\n`;
    }
    return defaultFence(tokens, idx, options, env, self);
  };
  return md;
}

// Print adjustments: on the web, overflowing code/tables scroll; on paper they
// would be clipped, so wrap them instead and keep blocks from splitting awkwardly.
const PRINT_CSS = `
  html, body { margin: 0; padding: 0; }
  .markdown-body { box-sizing: border-box; min-width: 0; max-width: none; padding: 0; }
  .markdown-body pre { white-space: pre-wrap; word-break: break-word; overflow: visible; }
  .markdown-body pre code { white-space: pre-wrap; word-break: break-word; }
  .markdown-body pre code.hljs { display: inline; background: transparent; padding: 0; overflow: visible; }
  .markdown-body hr.footnotes-sep { display: none; }
  .markdown-body table { display: table; width: auto; max-width: 100%; overflow: visible; }
  .markdown-body td, .markdown-body th { word-break: break-word; }
  .markdown-body img { max-width: 100%; }
  .markdown-body pre.mermaid { background: transparent; text-align: center; }
  .markdown-body .math-display { overflow: visible; margin-bottom: 16px; }
  .markdown-body h1, .markdown-body h2, .markdown-body h3,
  .markdown-body h4, .markdown-body h5, .markdown-body h6 { break-after: avoid; }
  .markdown-body pre, .markdown-body blockquote, .markdown-body tr,
  .markdown-body img, .markdown-body .markdown-alert, .markdown-body pre.mermaid { break-inside: avoid; }
  .markdown-body .task-list-item { list-style-type: none; }
  .markdown-body .task-list-item-checkbox { margin: 0 .2em .25em -1.4em; vertical-align: middle; }
`;

/**
 * @param {string} markdown
 * @param {{ baseDir?: string, title?: string, theme?: 'light'|'dark' }} [opts]
 */
export function renderHtml(markdown, opts = {}) {
  const theme = opts.theme === 'dark' ? 'dark' : 'light';
  const body = createMarkdown().render(markdown);
  const firstH1 = /^#\s+(.+)$/m.exec(markdown)?.[1];
  const title = opts.title ?? firstH1 ?? 'Document';
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
<style>html, body { background: ${bg}; }${PRINT_CSS}</style>
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
