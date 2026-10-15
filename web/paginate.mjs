// Choose page breaks for a document laid out as one tall column.
// Pure function (no DOM) so it can be unit-tested in Node.

const EPS = 0.5;

/** Merge overlapping [top, bottom] intervals (touching ones stay separate). */
function mergeIntervals(intervals) {
  const sorted = intervals.filter(([t, b]) => b - t > EPS).sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [t, b] of sorted) {
    const last = merged[merged.length - 1];
    if (last && t < last[1] - EPS) last[1] = Math.max(last[1], b);
    else merged.push([t, b]);
  }
  return merged;
}

/**
 * @param {object} p
 * @param {number[]} p.candidates  y positions where a break is allowed (e.g. bottoms of lines/blocks)
 * @param {Array<[number, number]>} p.blockers  [top, bottom] of things that must not be cut (text lines, images)
 * @param {number} p.total  total content height
 * @param {number} p.pageHeight  content height that fits on one page
 * @returns {Array<[number, number]>} [start, end) of each page
 */
export function paginate({ candidates, blockers = [], total, pageHeight }) {
  if (!(pageHeight > 0)) throw new Error('pageHeight must be positive');
  if (!(total > EPS)) return [[0, 0]];

  const merged = mergeIntervals(blockers);
  const isSafe = (y) => !merged.some(([t, b]) => t < y - EPS && y < b - EPS);
  const safe = [...new Set(candidates)].filter((y) => y > EPS && y < total - EPS && isSafe(y)).sort((a, b) => a - b);

  const pages = [];
  let top = 0;
  while (top < total - EPS) {
    const limit = top + pageHeight;
    if (limit >= total - EPS) {
      pages.push([top, total]);
      break;
    }
    let end = limit; // nothing safe on this page (e.g. one huge image): hard cut
    for (const y of safe) {
      if (y <= top + EPS) continue;
      if (y > limit + EPS) break;
      end = y;
    }
    pages.push([top, end]);
    top = end;
  }
  return pages;
}

/** Index of the page that contains y (for links and bookmarks). */
export function pageIndexAt(pages, y) {
  const i = pages.findIndex(([s, e]) => y >= s - EPS && y < e - EPS);
  return i === -1 ? pages.length - 1 : i;
}
