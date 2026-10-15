import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paginate, pageIndexAt } from '../web/paginate.mjs';

test('breaks at the last safe position that fits', () => {
  const pages = paginate({ candidates: [30, 60, 90, 120, 150], total: 150, pageHeight: 100 });
  assert.deepEqual(pages, [[0, 90], [90, 150]]);
});

test('never cuts through a blocker such as a text line', () => {
  // candidate 90 lies inside a line spanning 80..105, so the break moves up to 60
  const pages = paginate({ candidates: [60, 90], blockers: [[80, 105]], total: 150, pageHeight: 100 });
  assert.deepEqual(pages[0], [0, 60]);
});

test('touching line boxes do not block the boundary between them', () => {
  const pages = paginate({ candidates: [20, 40], blockers: [[0, 20], [20, 40], [40, 60]], total: 60, pageHeight: 45 });
  assert.deepEqual(pages, [[0, 40], [40, 60]]);
});

test('element taller than a page is cut at the page height', () => {
  const pages = paginate({ candidates: [250], blockers: [[0, 250]], total: 250, pageHeight: 100 });
  assert.deepEqual(pages, [[0, 100], [100, 200], [200, 250]]);
});

test('short and empty documents give a single page', () => {
  assert.deepEqual(paginate({ candidates: [10], total: 40, pageHeight: 100 }), [[0, 40]]);
  assert.deepEqual(paginate({ candidates: [], total: 0, pageHeight: 100 }), [[0, 0]]);
  assert.throws(() => paginate({ candidates: [], total: 10, pageHeight: 0 }));
});

test('pageIndexAt maps y to its page', () => {
  const pages = [[0, 90], [90, 150]];
  assert.equal(pageIndexAt(pages, 0), 0);
  assert.equal(pageIndexAt(pages, 89), 0);
  assert.equal(pageIndexAt(pages, 90), 1);
  assert.equal(pageIndexAt(pages, 999), 1);
});
