#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { Command } from 'commander';
import { convertFile, launchBrowser } from '../src/pdf.mjs';

async function collectMarkdown(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await collectMarkdown(full)));
    else if (/\.(md|markdown)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

const program = new Command()
  .name('md2pdf')
  .description('將 Markdown 依照網頁（GitHub 風格）顯示的排版轉成 PDF')
  .argument('<inputs...>', '.md 檔案或資料夾（資料夾會遞迴轉換所有 .md）')
  .option('-o, --output <path>', '輸出 .pdf 路徑（單一檔案）或輸出資料夾（多個檔案）')
  .option('-f, --format <format>', '紙張：A3, A4, A5, Letter, Legal', 'A4')
  .option('-l, --landscape', '橫向')
  .option('-m, --margin <size>', '頁邊距，例如 15mm、1cm、0.5in', '15mm')
  .option('-w, --width <px>', '模擬網頁內容寬度（px），0 = 直接使用紙張寬度', (v) => Number(v), 830)
  .option('-t, --theme <theme>', 'light 或 dark', 'light')
  .option('-p, --page-numbers', '頁尾加上頁碼')
  .option('--no-sandbox', '停用 Chrome sandbox（Ubuntu 23.10+ 無法啟動時使用；也可設 MD2PDF_NO_SANDBOX=1）')
  .action(async (inputs, opts) => {
    const files = [];
    for (const input of inputs) {
      const stat = await fs.stat(input);
      if (stat.isDirectory()) {
        const found = await collectMarkdown(input);
        files.push(...found.map((f) => ({ file: f, rel: path.relative(input, f) })));
      } else {
        files.push({ file: input, rel: path.basename(input) });
      }
    }
    if (files.length === 0) throw new Error('找不到任何 .md 檔案');

    const single = files.length === 1 && opts.output?.toLowerCase().endsWith('.pdf');
    const browser = await launchBrowser({ noSandbox: !opts.sandbox || process.env.MD2PDF_NO_SANDBOX === '1' });
    let failed = 0;
    try {
      for (const { file, rel } of files) {
        const output = single
          ? opts.output
          : opts.output
            ? path.join(opts.output, rel.replace(/\.(md|markdown)$/i, '.pdf'))
            : file.replace(/\.(md|markdown)$/i, '.pdf');
        try {
          await convertFile(file, output, { ...opts, browser });
          console.log(`✔ ${file} → ${output}`);
        } catch (err) {
          failed++;
          console.error(`✘ ${file}: ${err.message}`);
        }
      }
    } finally {
      await browser.close();
    }
    if (failed) process.exitCode = 1;
  });

program.parseAsync().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
