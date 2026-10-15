// Markdown -> GitHub-style HTML fragment. Shared by the Node CLI and the web
// app, so it must stay browser-safe (no node:* imports).
import MarkdownIt from 'markdown-it';
import anchor from 'markdown-it-anchor';
import footnote from 'markdown-it-footnote';
import taskLists from 'markdown-it-task-lists';
import { full as emoji } from 'markdown-it-emoji';
import alerts from 'markdown-it-github-alerts';
import katexPlugin from '@vscode/markdown-it-katex';
import katex from 'katex';
import hljs from 'highlight.js';

// Same algorithm as github-slugger: lowercase, drop punctuation, spaces -> '-'.
export function githubSlug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\p{N}\p{Pc}\- ]/gu, '')
    .replace(/ /g, '-');
}

export function escapeHtml(s) {
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

export function firstHeading(markdown) {
  return /^#\s+(.+)$/m.exec(markdown)?.[1];
}

// Print adjustments: on the web, overflowing code/tables scroll; on paper they
// would be clipped, so wrap them instead and keep blocks from splitting awkwardly.
export const PRINT_CSS = `
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

export const PAPER_MM = {
  A3: [297, 420],
  A4: [210, 297],
  A5: [148, 210],
  Letter: [215.9, 279.4],
  Legal: [215.9, 355.6],
};
export const PX_PER_MM = 96 / 25.4;

export function marginToMm(value) {
  const m = /^(\d+(?:\.\d+)?)(mm|cm|in|px)?$/.exec(String(value).trim());
  if (!m) throw new Error(`Invalid margin: ${value}`);
  const n = Number(m[1]);
  return { mm: n, cm: n * 10, in: n * 25.4, px: n / PX_PER_MM }[m[2] ?? 'mm'];
}

/** Paper size in mm, [width, height], honoring orientation. */
export function paperSizeMm(format = 'A4', landscape = false) {
  const paper = PAPER_MM[format];
  if (!paper) throw new Error(`Unknown format: ${format} (use ${Object.keys(PAPER_MM).join(', ')})`);
  return landscape ? [paper[1], paper[0]] : [paper[0], paper[1]];
}

/**
 * Layout the page `width` CSS px wide (like a browser window showing the
 * document), then scale it to fit the printable area, so line breaks and
 * proportions match what you see on the web.
 */
export function computeScale({ format = 'A4', landscape = false, margin = '15mm', width = 830 }) {
  if (!width) return 1;
  const [pageMm] = paperSizeMm(format, landscape);
  const printablePx = (pageMm - 2 * marginToMm(margin)) * PX_PER_MM;
  return Math.min(2, Math.max(0.1, printablePx / width));
}
