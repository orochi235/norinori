#!/usr/bin/env node
// Convert a letter grid to an nn-diagram `regions` attribute value.
//
// Usage:
//   echo "ABBB
//   ADBB
//   ADDB" | node tools/grid-to-regions.js
//
// Or pass a file:
//   node tools/grid-to-regions.js puzzle.txt
//
// Each distinct non-space, non-dot character is treated as a region ID.
// `.` and ` ` are treated as empty (no region).

import { readFileSync } from 'fs';

function gridToRegions(text) {
  const rows = text.split('\n').map(r => r.trimEnd()).filter(r => r.trim());
  const groups = {};
  rows.forEach((row, yi) => {
    const y = yi + 1;
    [...row].forEach((ch, xi) => {
      const x = xi + 1;
      if (ch === '.' || ch === ' ') return;
      (groups[ch] ??= []).push(`${x},${y}`);
    });
  });
  return Object.keys(groups).sort().map(k => groups[k].join(' ')).join(' | ');
}

const text = process.argv[2]
  ? readFileSync(process.argv[2], 'utf8')
  : readFileSync('/dev/stdin', 'utf8');

console.log(gridToRegions(text));
