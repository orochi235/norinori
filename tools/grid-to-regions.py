#!/usr/bin/env python3
"""Convert a letter grid to an nn-diagram `regions` attribute value.

Usage:
    echo "ABBB
    ADBB
    ADDB" | python3 tools/grid-to-regions.py

Or pass a file:
    python3 tools/grid-to-regions.py puzzle.txt

Each distinct non-space, non-dot character is treated as a region ID.
`.` and ` ` are treated as empty (no region).
"""

import sys


def grid_to_regions(text: str) -> str:
    rows = [r.rstrip() for r in text.splitlines() if r.strip()]
    groups: dict[str, list[tuple[int, int]]] = {}
    for y, row in enumerate(rows, start=1):
        for x, ch in enumerate(row, start=1):
            if ch in ('.', ' '):
                continue
            groups.setdefault(ch, []).append((x, y))
    return ' | '.join(
        ' '.join(f'{x},{y}' for x, y in groups[k])
        for k in sorted(groups)
    )


if __name__ == '__main__':
    if len(sys.argv) > 1:
        with open(sys.argv[1]) as f:
            text = f.read()
    else:
        text = sys.stdin.read()
    print(grid_to_regions(text))
