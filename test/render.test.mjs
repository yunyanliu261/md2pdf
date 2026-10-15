import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { githubSlug, renderHtml } from '../src/render.mjs';
import { computeScale } from '../src/pdf.mjs';

const sample = await fs.readFile(new URL('./fixtures/sample.md', import.meta.url), 'utf8');
const html = renderHtml(sample, { baseDir: '/docs' });

test('github-style slugs', () => {
  assert.equal(githubSlug('Hello, World!'), 'hello-world');
  assert.equal(githubSlug('表格'), '表格');
  assert.equal(githubSlug('A  b_c'), 'a--b_c');
});

test('renders GFM features', () => {
  assert.match(html, /<table>/);
  assert.match(html, /style="text-align:right"/);
  assert.match(html, /<s>刪除線<\/s>/);
  assert.match(html, /<a href="https:\/\/github.com">/);
  assert.match(html, /🚀/);
  assert.match(html, /class="task-list-item-checkbox"[^>]*checked/);
  assert.match(html, /markdown-alert markdown-alert-note/);
  assert.match(html, /class="footnotes"/);
  assert.match(html, /<h2 id="表格"/);
});

test('highlights code, math and mermaid', () => {
  assert.match(html, /<code class="hljs language-python">/);
  assert.match(html, /class="hljs-keyword">def</);
  assert.match(html, /class="katex"/);
  assert.match(html, /katex-display/);
  assert.match(html, /<pre class="mermaid">graph LR/);
  assert.match(html, /mermaid\.min\.js/);
});

test('document shell', () => {
  const base = pathToFileURL(path.resolve('/docs') + path.sep).href; // file:///D:/docs/ on Windows
  assert.ok(html.includes(`<base href="${base}">`), `missing <base href="${base}">`);
  assert.match(html, /<title>範例文件 Sample<\/title>/);
  assert.match(html, /github-markdown-light\.css/);
  assert.doesNotMatch(renderHtml('plain'), /mermaid\.min\.js/);
  assert.match(renderHtml('x', { theme: 'dark' }), /github-markdown-dark\.css/);
});

test('escapes raw mermaid source', () => {
  assert.match(renderHtml('```mermaid\nA-->B<script>\n```'), /A--&gt;B&lt;script&gt;/);
});

test('scale fits web width into printable area', () => {
  // A4 210mm - 2*15mm = 180mm ≈ 680.3px
  assert.ok(Math.abs(computeScale({ width: 830 }) - 680.3 / 830) < 0.001);
  assert.equal(computeScale({ width: 0 }), 1);
  assert.throws(() => computeScale({ format: 'B9' }));
  assert.throws(() => computeScale({ margin: 'abc' }));
});
