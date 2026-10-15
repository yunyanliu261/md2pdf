// End-to-end tests for the web app in dist/ (built by `npm run build:web`, run as pretest).
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { launchBrowser } from '../src/pdf.mjs';
import { serve } from '../scripts/serve.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const sample = await fs.readFile(new URL('./fixtures/sample.md', import.meta.url), 'utf8');

let server;
let browser;
const errors = [];

async function openApp(viewport = { width: 1280, height: 900 }) {
  const page = await browser.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.setViewport(viewport);
  await page.goto(server.url, { waitUntil: 'networkidle0' });
  return page;
}

function pdfPageSizes(buf) {
  const text = buf.toString('latin1');
  return [...text.matchAll(/\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/g)].map((m) => [
    Math.round(Number(m[1])),
    Math.round(Number(m[2])),
  ]);
}

before(async () => {
  server = await serve(path.join(root, 'dist'));
  browser = await launchBrowser();
});
after(async () => {
  await browser?.close();
  await server?.close();
});

test('preview renders GitHub-style content', { timeout: 60000 }, async () => {
  const page = await openApp();
  await page.evaluate((t) => window.md2pdf.setMarkdown(t, 'sample'), sample);
  const found = await page.evaluate(() => ({
    table: !!document.querySelector('#preview table'),
    katex: !!document.querySelector('#preview .katex'),
    mermaid: !!document.querySelector('#preview pre.mermaid svg'),
    alert: !!document.querySelector('#preview .markdown-alert-note'),
    format: document.querySelector('select[name=format]').value,
  }));
  assert.deepEqual(found, { table: true, katex: true, mermaid: true, alert: true, format: 'A4' });
  await page.close();
});

test('exports an A4 PDF with links and bookmarks; Letter when selected', { timeout: 120000 }, async () => {
  const page = await openApp();
  await page.evaluate((t) => window.md2pdf.setMarkdown(t, 'sample'), sample);

  const a4 = Buffer.from(await page.evaluate(() => window.md2pdf.pdfBase64()), 'base64');
  assert.equal(a4.subarray(0, 5).toString(), '%PDF-');
  const sizes = pdfPageSizes(a4);
  assert.ok(sizes.length >= 1);
  for (const s of sizes) assert.deepEqual(s, [595, 842]);
  const text = a4.toString('latin1');
  assert.match(text, /\/Annots/);
  assert.match(text, /\/URI \(https:\/\/github\.com/);
  assert.match(text, /\/Outlines/);

  await page.select('select[name=format]', 'Letter');
  const letter = Buffer.from(await page.evaluate(() => window.md2pdf.pdfBase64()), 'base64');
  for (const s of pdfPageSizes(letter)) assert.deepEqual(s, [612, 792]);
  await page.select('select[name=format]', 'A4');
  await page.close();
});

test('「輸出 PDF 檔案」 downloads the file in download mode', { timeout: 120000 }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'md2pdf-dl-'));
  const page = await openApp();
  try {
    const cdp = await page.createCDPSession();
    await cdp.send('Browser.setDownloadBehavior', { behavior: 'allow', downloadPath: dir });
    await page.evaluate((t) => window.md2pdf.setMarkdown(t, 'sample'), sample);
    await page.select('select[name=saveMode]', 'download');
    await page.click('#export-btn');
    const file = path.join(dir, 'sample.pdf');
    for (let i = 0; i < 120; i++) {
      if ((await fs.stat(file).catch(() => null))?.size) break;
      await new Promise((r) => setTimeout(r, 500));
    }
    const buf = await fs.readFile(file);
    assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
    assert.match(await page.$eval('#status', (e) => e.textContent), /已下載/);
  } finally {
    await page.close();
    await fs.rm(dir, { recursive: true, force: true });
  }
});

test('print layout hides the app UI and uses the chosen paper', { timeout: 60000 }, async () => {
  const page = await openApp();
  await page.evaluate((t) => window.md2pdf.setMarkdown(t, 'sample'), sample);
  await page.emulateMediaType('print');
  const hidden = await page.evaluate(() =>
    ['.toolbar', '.settings-panel', '.editor-pane'].every((s) => getComputedStyle(document.querySelector(s)).display === 'none'),
  );
  assert.ok(hidden, 'toolbar/settings/editor should be hidden when printing');
  const pdf = Buffer.from(await page.pdf({ preferCSSPageSize: true, printBackground: true }));
  assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
  for (const s of pdfPageSizes(pdf)) assert.deepEqual(s, [595, 842]);
  await page.close();
});

test('phone-sized screen has no horizontal scrolling', { timeout: 60000 }, async () => {
  const page = await openApp({ width: 412, height: 915, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.evaluate((t) => window.md2pdf.setMarkdown(t, 'sample'), sample);
  const [scrollW, innerW] = await page.evaluate(() => [document.documentElement.scrollWidth, innerWidth]);
  assert.ok(scrollW <= innerW, `scrollWidth ${scrollW} > ${innerW}`);
  await page.close();
});

test('opening a .md together with its images resolves relative image paths', { timeout: 60000 }, async () => {
  const page = await openApp();
  const input = await page.$('#file-input');
  await input.uploadFile(
    fileURLToPath(new URL('./fixtures/sample.md', import.meta.url)),
    fileURLToPath(new URL('./fixtures/img/logo.svg', import.meta.url)),
  );
  await page.waitForFunction(() => document.querySelector('#status').textContent.includes('sample.md'));
  const img = await page.evaluate(() => {
    const el = document.querySelector('#preview img[alt=logo]');
    return { blob: el.src.startsWith('blob:'), missing: el.classList.contains('missing') };
  });
  assert.deepEqual(img, { blob: true, missing: false });
  assert.equal(await page.$eval('#editor', (e) => e.value.startsWith('# 範例文件')), true);
  await page.close();
});

test('no page errors', () => {
  assert.deepEqual(errors, []);
});
