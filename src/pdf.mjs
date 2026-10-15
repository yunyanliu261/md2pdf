// HTML -> PDF with headless Chrome.
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import puppeteer from 'puppeteer';
import { renderHtml } from './render.mjs';
import { computeScale } from './markdown.mjs';

export { computeScale };

// Ubuntu 23.10+ blocks Chrome's sandbox via AppArmor; disabling it is opt-in
// (--no-sandbox / MD2PDF_NO_SANDBOX=1) because pages may contain untrusted HTML.
export async function launchBrowser({ noSandbox = process.env.MD2PDF_NO_SANDBOX === '1' } = {}) {
  const args = ['--allow-file-access-from-files'];
  if (noSandbox) args.push('--no-sandbox', '--disable-setuid-sandbox');
  return puppeteer.launch({ headless: 'shell', args });
}

/**
 * Convert one Markdown file to PDF.
 * @param {string} input path to .md
 * @param {string} output path to .pdf
 * @param {object} [opts] format, landscape, margin, width, theme, pageNumbers, browser
 */
export async function convertFile(input, output, opts = {}) {
  const markdown = await fs.readFile(input, 'utf8');
  const html = renderHtml(markdown, {
    baseDir: path.dirname(path.resolve(input)),
    theme: opts.theme,
    title: opts.title,
  });

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'md2pdf-'));
  const tmpHtml = path.join(tmpDir, 'index.html');
  await fs.writeFile(tmpHtml, html);

  const browser = opts.browser ?? (await launchBrowser({ noSandbox: opts.noSandbox }));
  const page = await browser.newPage();
  try {
    await page.goto(pathToFileURL(tmpHtml).href, { waitUntil: 'networkidle0', timeout: opts.timeout ?? 60000 });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all(
        [...document.images].map((img) =>
          img.complete ? null : new Promise((r) => img.addEventListener('loadend', r, { once: true })),
        ),
      );
      if (window.__md2pdfMermaid) await window.__md2pdfMermaid;
    });

    const margin = opts.margin ?? '15mm';
    const pageNumbers = Boolean(opts.pageNumbers);
    await fs.mkdir(path.dirname(path.resolve(output)), { recursive: true });
    await page.pdf({
      path: output,
      format: opts.format ?? 'A4',
      landscape: Boolean(opts.landscape),
      scale: computeScale({ ...opts, margin }),
      printBackground: true,
      outline: true,
      tagged: true,
      margin: { top: margin, right: margin, bottom: margin, left: margin },
      displayHeaderFooter: pageNumbers,
      headerTemplate: '<span></span>',
      footerTemplate: pageNumbers
        ? '<div style="width:100%;text-align:center;font-size:9px;color:#888;"><span class="pageNumber"></span> / <span class="totalPages"></span></div>'
        : '<span></span>',
    });
  } finally {
    await page.close();
    if (!opts.browser) await browser.close();
    await fs.rm(tmpDir, { recursive: true, force: true });
  }
  return output;
}
