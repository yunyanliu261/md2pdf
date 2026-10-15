import './app.css';
import { createMarkdown, firstHeading, PRINT_CSS, paperSizeMm, marginToMm, PX_PER_MM } from '../src/markdown.mjs';
import { exportPdf } from './export.mjs';

const $ = (sel) => document.querySelector(sel);
const md = createMarkdown();

const DEFAULTS = { format: 'A4', landscape: '', margin: '15mm', width: '830', theme: 'light', saveMode: 'ask' };
const canPickLocation = typeof window.showSaveFilePicker === 'function';

const store = {
  get(key) {
    try { return localStorage.getItem(`md2pdf:${key}`); } catch { return null; }
  },
  set(key, value) {
    try { localStorage.setItem(`md2pdf:${key}`, value); } catch { /* private mode etc. */ }
  },
};

const WELCOME = `# 歡迎使用 md2pdf

按上方 **開啟檔案** 選擇 \`.md\`（可同時選文件裡用到的圖片），或把檔案拖進來，也可以直接在「編輯」裡貼上 Markdown。

- **輸出 PDF 檔案**：直接產生 PDF 並存檔。
- **列印**：開啟系統列印，可接印表機，或「另存為 PDF」得到可選取文字的 PDF。

> [!TIP]
> 檔案只在你的裝置上處理，不會上傳。

| 功能 | 支援 |
|:--|:--:|
| 表格、任務清單、註腳 | ✅ |
| 程式碼上色 | ✅ |
| 數學式 $E=mc^2$ | ✅ |
| Mermaid 圖表 | ✅ |
`;

const state = {
  settings: { ...DEFAULTS },
  name: 'document',
  images: new Map(), // relative path or basename -> blob URL
};

// ---------- settings ----------
function loadSettings() {
  try {
    Object.assign(state.settings, JSON.parse(store.get('settings') || '{}'));
  } catch { /* ignore corrupt value */ }
  if (!canPickLocation) state.settings.saveMode = 'download';
  const form = $('#settings');
  for (const [key, value] of Object.entries(state.settings)) {
    if (form.elements[key]) form.elements[key].value = value;
  }
  if (!canPickLocation) {
    const opt = form.elements.saveMode.querySelector('option[value="ask"]');
    opt.disabled = true;
    opt.textContent = '每次詢問儲存位置（此瀏覽器不支援）';
  }
}

function updateSettingsSummary() {
  const { format, landscape, margin, theme } = state.settings;
  $('#settings-summary').textContent =
    `輸出設定：${format}・${landscape ? '橫向' : '直向'}・邊距 ${margin.replace('mm', ' mm')}・${theme === 'dark' ? '深色' : '淺色'}`;
}

function saveSettings() {
  const form = $('#settings');
  for (const key of Object.keys(DEFAULTS)) state.settings[key] = form.elements[key].value;
  store.set('settings', JSON.stringify(state.settings));
  updateSettingsSummary();
  applyLayout();
}

function layoutParams() {
  const { format, landscape, margin, width } = state.settings;
  const [pageW] = paperSizeMm(format, Boolean(landscape));
  const marginMm = marginToMm(margin);
  const w = Number(width);
  const scale = ((pageW - 2 * marginMm) * PX_PER_MM) / w; // layout px -> paper px
  return { w, scale, marginLayoutPx: (marginMm * PX_PER_MM) / scale, pageW, marginMm };
}

// ---------- layout / theme / print css ----------
const pageStyle = document.createElement('style');
pageStyle.textContent = PRINT_CSS;
const dynamicStyle = document.createElement('style');
document.head.append(pageStyle, dynamicStyle);

function applyLayout() {
  const { format, landscape, margin, theme } = state.settings;
  const { w, scale, marginLayoutPx } = layoutParams();
  const dark = theme === 'dark';
  $('#md-light').disabled = dark;
  $('#md-dark').disabled = !dark;

  const sheet = $('#sheet');
  sheet.dataset.theme = theme;
  sheet.style.width = `${w + 2 * marginLayoutPx}px`;
  sheet.style.padding = `${marginLayoutPx}px`;
  $('#preview').style.width = `${w}px`;

  const size = `${format}${landscape ? ' landscape' : ' portrait'}`;
  dynamicStyle.textContent = `
    @page { size: ${size}; margin: ${margin}; }
    @media print {
      .sheet { zoom: ${scale.toFixed(4)}; background: ${dark ? '#0d1117' : '#ffffff'}; }
      html, body { background: ${dark ? '#0d1117' : '#ffffff'}; }
    }`;
  fitPreview();
}

function fitPreview() {
  const pane = $('.preview-pane');
  const sheet = $('#sheet');
  const available = pane.clientWidth - 16;
  const natural = parseFloat(sheet.style.width) || 1;
  const z = Math.min(1, available / natural);
  sheet.style.zoom = z > 0 ? z.toFixed(4) : '1';
}

// ---------- rendering ----------
let renderSeq = 0;
async function render() {
  const seq = ++renderSeq;
  const text = $('#editor').value;
  const article = $('#preview');
  // Parse into an inert template first so relative image paths are swapped for
  // the user's files before the browser tries to fetch them from this site.
  const tpl = document.createElement('template');
  tpl.innerHTML = md.render(text);
  const missing = resolveImages(tpl.content);
  article.replaceChildren(tpl.content);

  const mermaidNodes = article.querySelectorAll('pre.mermaid');
  if (mermaidNodes.length) {
    try {
      const { default: mermaid } = await import('mermaid');
      if (seq !== renderSeq) return;
      mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', theme: state.settings.theme === 'dark' ? 'dark' : 'default' });
      await mermaid.run({ nodes: mermaidNodes, suppressErrors: true });
    } catch (err) {
      setStatus(`Mermaid 圖表繪製失敗：${err.message}`, 'error');
    }
  }
  if (seq !== renderSeq) return;
  if (missing.length) setStatus(`找不到圖片：${missing.join('、')}（開檔時請一起選取這些圖片）`, 'error');
  fitPreview();
}

function normalizePath(p) {
  return decodeURIComponent(p.split(/[?#]/)[0]).replace(/\\/g, '/').replace(/^(\.\/)+/, '').replace(/^\//, '');
}

const MISSING_IMAGE = `data:image/svg+xml,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="40"><rect width="160" height="40" fill="#f6f8fa"/>' +
    '<text x="80" y="25" font-size="13" text-anchor="middle" fill="#d1242f" font-family="sans-serif">圖片未選取</text></svg>',
)}`;

function resolveImages(root) {
  const missing = [];
  for (const img of root.querySelectorAll('img[src]')) {
    const src = img.getAttribute('src');
    if (/^([a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) continue;
    let key;
    try { key = normalizePath(src); } catch { key = src; }
    const url = state.images.get(key) ?? state.images.get(key.split('/').pop());
    if (url) img.src = url;
    else {
      img.dataset.src = src;
      img.src = MISSING_IMAGE;
      img.classList.add('missing');
      missing.push(src);
    }
  }
  return missing;
}

let renderTimer;
function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(render, 250);
}

// ---------- files ----------
const isMarkdown = (f) => /\.(md|markdown|mdown|mkd|txt)$/i.test(f.name) || f.type === 'text/markdown';
const isImage = (f) => f.type.startsWith('image/') || /\.(png|jpe?g|gif|svg|webp|bmp|avif)$/i.test(f.name);

async function openFiles(fileList) {
  const files = [...fileList];
  const doc = files.find(isMarkdown);
  const images = files.filter(isImage);
  if (!doc && !images.length) {
    setStatus('請選擇 .md 檔案（可同時選圖片）', 'error');
    return;
  }
  if (images.length) {
    if (doc) {
      for (const url of state.images.values()) URL.revokeObjectURL(url);
      state.images.clear();
    }
    for (const f of images) {
      const url = URL.createObjectURL(f);
      state.images.set(f.name, url);
      if (f.webkitRelativePath) {
        state.images.set(normalizePath(f.webkitRelativePath.split('/').slice(1).join('/')), url);
      }
    }
  }
  if (doc) {
    $('#editor').value = await doc.text();
    state.name = doc.name.replace(/\.[^.]+$/, '') || 'document';
    store.set('name', state.name);
    store.set('draft', $('#editor').value);
    selectTab('preview');
  }
  setStatus(doc ? `已開啟：${doc.name}${images.length ? `（含 ${images.length} 張圖片）` : ''}` : `已加入 ${images.length} 張圖片`);
  await render();
}

// ---------- output ----------
function pdfFileName() {
  return `${state.name}.pdf`;
}

function setStatus(text, kind = '') {
  const el = $('#status');
  el.textContent = text;
  el.dataset.kind = kind;
}

function setBusy(busy) {
  for (const id of ['#export-btn', '#print-btn']) $(id).disabled = busy;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function generatePdf() {
  await render();
  return exportPdf($('#preview'), {
    ...state.settings,
    landscape: Boolean(state.settings.landscape),
    title: firstHeading($('#editor').value) ?? state.name,
    onProgress: (done, total) => setStatus(`產生 PDF 中…第 ${done} / ${total} 頁`),
  });
}

async function onExport() {
  // The save dialog must open right after the click (user activation),
  // before the slow PDF generation starts.
  let handle = null;
  if (state.settings.saveMode === 'ask' && canPickLocation) {
    try {
      handle = await window.showSaveFilePicker({
        suggestedName: pdfFileName(),
        types: [{ description: 'PDF 文件', accept: { 'application/pdf': ['.pdf'] } }],
      });
    } catch (err) {
      if (err.name === 'AbortError') return setStatus('已取消');
      handle = null; // fall back to a normal download
    }
  }
  setBusy(true);
  setStatus('產生 PDF 中…');
  try {
    const blob = await generatePdf();
    if (handle) {
      const writable = await handle.createWritable();
      await writable.write(blob);
      await writable.close();
      setStatus(`已儲存：${handle.name}`, 'ok');
    } else {
      downloadBlob(blob, pdfFileName());
      setStatus(`已下載：${pdfFileName()}（存在瀏覽器的下載資料夾）`, 'ok');
    }
  } catch (err) {
    console.error(err);
    setStatus(`輸出失敗：${err.message}`, 'error');
  } finally {
    setBusy(false);
  }
}

async function onPrint() {
  await render();
  const title = document.title;
  document.title = state.name; // browsers use the title as the default PDF name
  window.addEventListener('afterprint', () => (document.title = title), { once: true });
  window.print();
}

// ---------- tabs ----------
function selectTab(tab) {
  $('.workspace').dataset.tab = tab;
  for (const b of document.querySelectorAll('.tabs button')) b.setAttribute('aria-selected', String(b.dataset.tab === tab));
  if (tab === 'preview') requestAnimationFrame(fitPreview);
}

// ---------- wiring ----------
function init() {
  loadSettings();
  updateSettingsSummary();
  // Settings are always visible on wide screens; on phones they start collapsed.
  $('#settings-panel').open = window.matchMedia('(min-width: 861px)').matches;
  $('#editor').value = store.get('draft') ?? WELCOME;
  state.name = store.get('name') ?? 'document';

  $('#settings').addEventListener('change', () => {
    saveSettings();
    render();
  });
  $('#editor').addEventListener('input', () => {
    store.set('draft', $('#editor').value);
    scheduleRender();
  });
  $('#file-input').addEventListener('change', (e) => {
    openFiles(e.target.files);
    e.target.value = '';
  });
  $('#export-btn').addEventListener('click', onExport);
  $('#print-btn').addEventListener('click', onPrint);
  for (const b of document.querySelectorAll('.tabs button')) b.addEventListener('click', () => selectTab(b.dataset.tab));
  window.addEventListener('resize', fitPreview);

  const overlay = $('#drop-overlay');
  let depth = 0;
  window.addEventListener('dragenter', (e) => {
    if (![...(e.dataTransfer?.types ?? [])].includes('Files')) return;
    depth++;
    overlay.hidden = false;
  });
  window.addEventListener('dragleave', () => {
    if (--depth <= 0) { depth = 0; overlay.hidden = true; }
  });
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    depth = 0;
    overlay.hidden = true;
    if (e.dataTransfer?.files?.length) openFiles(e.dataTransfer.files);
  });

  // Installed PWA on Windows: "Open with md2pdf" from Explorer.
  if ('launchQueue' in window) {
    window.launchQueue.setConsumer(async (params) => {
      if (!params.files?.length) return;
      openFiles(await Promise.all(params.files.map((h) => h.getFile())));
    });
  }
  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  applyLayout();
  render();
}

// Hooks for automated tests.
window.md2pdf = {
  async setMarkdown(text, name = 'document') {
    $('#editor').value = text;
    state.name = name;
    await render();
  },
  async pdfBase64() {
    const blob = await generatePdf();
    const dataUrl = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.readAsDataURL(blob);
    });
    return dataUrl.slice(dataUrl.indexOf(',') + 1);
  },
};

init();
