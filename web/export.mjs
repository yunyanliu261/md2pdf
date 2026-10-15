// Render the preview article straight into a PDF file (no print dialog).
// Each page is a high-resolution image of the web layout; links and heading
// bookmarks are added as real PDF annotations / outline entries.
import { domToCanvas } from 'modern-screenshot';
import { jsPDF } from 'jspdf';
import { paginate, pageIndexAt } from './paginate.mjs';
import { paperSizeMm, marginToMm } from '../src/markdown.mjs';

const isAndroid = /Android/i.test(navigator.userAgent);

// Elements whose bottom edge is a natural page-break position.
const BLOCK_SELECTOR =
  'p, li, tr, h1, h2, h3, h4, h5, h6, blockquote, pre, table, hr, dl, details, img, svg, ' +
  '.markdown-alert, .katex-display, .math-display, .footnotes';
// Things a page break must never cut through (besides text lines).
const ATOMIC_SELECTOR = 'img, svg, video, canvas, .katex-display, .math-display';

function collectGeometry(article) {
  const base = article.getBoundingClientRect().top;
  const candidates = [];
  const blockers = [];

  const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT);
  const range = document.createRange();
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    if (!node.textContent.trim()) continue;
    range.selectNodeContents(node);
    for (const r of range.getClientRects()) {
      if (r.height <= 0) continue;
      blockers.push([r.top - base, r.bottom - base]);
      candidates.push(r.bottom - base);
    }
  }
  for (const el of article.querySelectorAll(BLOCK_SELECTOR)) {
    if (el.closest('svg') && el.tagName.toLowerCase() !== 'svg') continue;
    candidates.push(el.getBoundingClientRect().bottom - base);
  }
  for (const el of article.querySelectorAll(ATOMIC_SELECTOR)) {
    if (el.parentElement?.closest('svg')) continue;
    const r = el.getBoundingClientRect();
    blockers.push([r.top - base, r.bottom - base]);
  }
  // Keep each table row and each heading together with what follows it.
  for (const tr of article.querySelectorAll('tr')) {
    const r = tr.getBoundingClientRect();
    blockers.push([r.top - base, r.bottom - base]);
  }
  for (const h of article.querySelectorAll('h1, h2, h3, h4, h5, h6')) {
    const r = h.getBoundingClientRect();
    const next = h.nextElementSibling?.getBoundingClientRect();
    const keepUntil = next ? Math.min(next.bottom, next.top + 48) : r.bottom;
    blockers.push([r.top - base, keepUntil - base]);
  }

  const links = [];
  for (const a of article.querySelectorAll('a[href]')) {
    const href = a.getAttribute('href');
    for (const r of a.getClientRects()) {
      if (r.width > 0 && r.height > 0) {
        links.push({ href, x: r.left - article.getBoundingClientRect().left, top: r.top - base, w: r.width, h: r.height });
      }
    }
  }
  const anchors = new Map();
  for (const el of article.querySelectorAll('[id]')) anchors.set(el.id, el.getBoundingClientRect().top - base);
  const headings = [...article.querySelectorAll('h1, h2, h3, h4, h5, h6')].map((h) => ({
    level: Number(h.tagName[1]),
    title: h.textContent.trim(),
    top: h.getBoundingClientRect().top - base,
  }));

  return { candidates, blockers, links, anchors, headings, total: article.getBoundingClientRect().height };
}

async function waitForImages(root) {
  await Promise.all(
    [...root.querySelectorAll('img')].map((img) => (img.decode ? img.decode().catch(() => {}) : null)),
  );
  await document.fonts?.ready;
}

/**
 * @param {HTMLElement} sourceArticle rendered .markdown-body (mermaid already drawn)
 * @param {object} opts format, landscape, margin, width, theme, title, onProgress(done, total)
 * @returns {Promise<Blob>}
 */
export async function exportPdf(sourceArticle, opts) {
  const width = Number(opts.width) || 830;
  const [pageW, pageH] = paperSizeMm(opts.format, opts.landscape);
  const marginMm = marginToMm(opts.margin);
  const printableW = pageW - 2 * marginMm;
  const printableH = pageH - 2 * marginMm;
  const mmPerPx = printableW / width; // layout px -> mm on paper
  const pageHeightPx = printableH / mmPerPx;
  const dark = opts.theme === 'dark';
  const bg = dark ? '#0d1117' : '#ffffff';

  // Lay the document out off-screen at the web width, independent of the preview zoom.
  const stage = document.createElement('div');
  stage.className = 'export-stage';
  stage.style.cssText = `position:fixed;left:-100000px;top:0;width:${width}px;background:${bg};`;
  const viewport = document.createElement('div');
  viewport.style.cssText = `width:${width}px;background:${bg};`;
  const article = sourceArticle.cloneNode(true);
  article.removeAttribute('id');
  article.style.cssText = `width:${width}px;margin:0;padding:0;zoom:1;`;
  viewport.append(article);
  stage.append(viewport);
  document.body.append(stage);

  try {
    await waitForImages(article);
    const geo = collectGeometry(article);
    const pages = paginate({ ...geo, pageHeight: pageHeightPx });

    const dpi = isAndroid ? 200 : 300;
    const scale = ((printableW / 25.4) * dpi) / width;
    const maxSide = 16384;
    const maxArea = isAndroid ? 16_000_000 : 60_000_000;
    const chunkMax = Math.max(pageHeightPx, Math.min(maxSide / scale, maxArea / (width * scale * scale)));

    // Group pages into chunks so one capture covers several pages.
    const chunks = [];
    for (const [i, [s, e]] of pages.entries()) {
      const last = chunks[chunks.length - 1];
      if (last && e - last.start <= chunkMax) {
        last.end = e;
        last.pages.push(i);
      } else {
        chunks.push({ start: s, end: e, pages: [i] });
      }
    }

    const pdf = new jsPDF({ unit: 'mm', format: [pageW, pageH], orientation: pageW > pageH ? 'landscape' : 'portrait', compress: true });
    pdf.setProperties({ title: opts.title || 'Document', creator: 'md2pdf' });

    let done = 0;
    viewport.style.overflow = 'hidden';
    for (const chunk of chunks) {
      const chunkH = chunk.end - chunk.start;
      viewport.style.height = `${chunkH}px`;
      article.style.transform = `translateY(${-chunk.start}px)`;
      const canvas = await domToCanvas(viewport, {
        width,
        height: chunkH,
        scale,
        backgroundColor: bg,
        maximumCanvasSize: maxSide,
      });
      const k = canvas.height / chunkH; // device px per layout px actually achieved

      for (const i of chunk.pages) {
        const [s, e] = pages[i];
        const sliceH = e - s;
        const page = document.createElement('canvas');
        page.width = canvas.width;
        page.height = Math.max(1, Math.round(sliceH * k));
        const ctx = page.getContext('2d');
        ctx.fillStyle = bg;
        ctx.fillRect(0, 0, page.width, page.height);
        ctx.drawImage(canvas, 0, Math.round((s - chunk.start) * k), canvas.width, page.height, 0, 0, page.width, page.height);

        if (i > 0) pdf.addPage([pageW, pageH], pageW > pageH ? 'landscape' : 'portrait');
        if (dark) {
          pdf.setFillColor(13, 17, 23);
          pdf.rect(0, 0, pageW, pageH, 'F');
        }
        pdf.addImage(page.toDataURL('image/jpeg', 0.92), 'JPEG', marginMm, marginMm, printableW, sliceH * mmPerPx, undefined, 'FAST');

        for (const link of geo.links) {
          if (pageIndexAt(pages, link.top) !== i) continue;
          const x = marginMm + link.x * mmPerPx;
          const y = marginMm + (link.top - s) * mmPerPx;
          const w = link.w * mmPerPx;
          const h = link.h * mmPerPx;
          if (link.href.startsWith('#')) {
            const target = geo.anchors.get(decodeURIComponent(link.href.slice(1)));
            if (target !== undefined) pdf.link(x, y, w, h, { pageNumber: pageIndexAt(pages, target) + 1 });
          } else if (/^(https?:|mailto:)/i.test(link.href)) {
            pdf.link(x, y, w, h, { url: link.href });
          }
        }
        page.width = page.height = 0; // free memory early (matters on Android)
        opts.onProgress?.(++done, pages.length);
      }
      canvas.width = canvas.height = 0;
    }

    // Bookmarks: nest headings by level.
    const stack = [];
    for (const h of geo.headings) {
      while (stack.length && stack[stack.length - 1].level >= h.level) stack.pop();
      const parent = stack.length ? stack[stack.length - 1].node : null;
      const node = pdf.outline.add(parent, h.title, { pageNumber: pageIndexAt(pages, h.top) + 1 });
      stack.push({ level: h.level, node });
    }

    return pdf.output('blob');
  } finally {
    stage.remove();
  }
}
