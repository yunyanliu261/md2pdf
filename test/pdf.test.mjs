import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { convertFile } from '../src/pdf.mjs';

const fixture = fileURLToPath(new URL('./fixtures/sample.md', import.meta.url));

test('converts the sample to a valid PDF', { timeout: 120000 }, async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'md2pdf-test-'));
  const out = path.join(dir, 'sample.pdf');
  try {
    await convertFile(fixture, out, { pageNumbers: true });
    const buf = await fs.readFile(out);
    assert.equal(buf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(buf.length > 10000, `PDF unexpectedly small: ${buf.length} bytes`);
    // outline: true -> heading bookmarks
    assert.match(buf.toString('latin1'), /\/Outlines/);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
