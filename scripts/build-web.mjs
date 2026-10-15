// Build the web app into dist/ (static files for GitHub Pages).
//   node scripts/build-web.mjs           one-off build
//   node scripts/build-web.mjs --serve   build, then serve on http://localhost:8080
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const web = path.join(root, 'web');
const dist = path.join(root, 'dist');

async function listFiles(dir) {
  const out = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await listFiles(full)));
    else out.push(full);
  }
  return out;
}

export async function buildWeb() {
  await fs.rm(dist, { recursive: true, force: true });
  const { metafile } = await esbuild.build({
    absWorkingDir: root,
    entryPoints: {
      app: 'web/app.mjs',
      'md-light': 'web/md-light.css',
      'md-dark': 'web/md-dark.css',
    },
    outdir: dist,
    bundle: true,
    splitting: true,
    format: 'esm',
    minify: true,
    target: ['chrome100', 'edge100', 'firefox115', 'safari15'],
    entryNames: '[name]',
    chunkNames: 'chunks/[name]-[hash]',
    assetNames: 'assets/[name]-[hash]',
    loader: { '.woff2': 'file', '.woff': 'file', '.ttf': 'file' },
    define: { 'process.env.NODE_ENV': '"production"' },
    legalComments: 'none',
    logLevel: 'warning',
    metafile: true,
  });

  for (const name of ['index.html', 'manifest.webmanifest']) {
    await fs.copyFile(path.join(web, name), path.join(dist, name));
  }
  await fs.cp(path.join(web, 'icons'), path.join(dist, 'icons'), { recursive: true });

  const files = (await listFiles(dist)).map((f) => path.relative(dist, f).split(path.sep).join('/')).sort();
  const hash = crypto.createHash('sha256');
  for (const f of files) hash.update(f).update(await fs.readFile(path.join(dist, f)));
  // Precache the core app and the chunks it imports statically; lazily loaded
  // chunks (Mermaid) and legacy font formats are cached on first use.
  const rel = (p) => path.relative(dist, path.resolve(root, p)).split(path.sep).join('/');
  const needed = new Set();
  const visit = (out) => {
    for (const imp of metafile.outputs[out]?.imports ?? []) {
      if (imp.kind === 'import-statement' && !needed.has(imp.path)) {
        needed.add(imp.path);
        visit(imp.path);
      }
    }
  };
  visit(Object.keys(metafile.outputs).find((o) => o.endsWith('app.js')));
  const staticChunks = new Set([...needed].map(rel));
  const core = files.filter(
    (f) => f !== 'index.html' && (!f.startsWith('chunks/') || staticChunks.has(f)) && !/\.(woff|ttf)$/.test(f),
  );
  const assets = ['./', ...core];
  const sw = (await fs.readFile(path.join(web, 'sw.template.js'), 'utf8'))
    .replace('__VERSION__', hash.digest('hex').slice(0, 12))
    .replace('__ASSETS__', JSON.stringify(assets));
  await fs.writeFile(path.join(dist, 'sw.js'), sw);
  return dist;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildWeb();
  console.log(`built ${path.relative(process.cwd(), dist) || dist}`);
  if (process.argv.includes('--serve')) {
    const { serve } = await import('./serve.mjs');
    const { url } = await serve(dist, 8080);
    console.log(`serving ${url}`);
  }
}
