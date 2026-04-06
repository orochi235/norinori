class NNDiagram extends HTMLElement {
  static get observedAttributes() {
    return ['regions', 'shaded', 'excluded', 'unknown', 'ish', 'labels', 'baseline', 'checkerboard', 'extents', 'continue', 'show-errors'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() { this.render(); }
  attributeChangedCallback() { this.render(); }

  static parseCoord(s) {
    const [x, y] = s.split(',').map(Number);
    return { x, y };
  }

  static parseRegionToken(token) {
    token = token.trim();
    if (token.includes(':')) {
      const [from, to] = token.split(':');
      const a = NNDiagram.parseCoord(from);
      const b = NNDiagram.parseCoord(to);
      const cells = [];
      const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x);
      const y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y);
      for (let y = y0; y <= y1; y++)
        for (let x = x0; x <= x1; x++)
          cells.push({ x, y });
      return cells;
    }
    return [NNDiagram.parseCoord(token)];
  }

  static parseRegion(s) {
    return s.trim().split(/\s+/).flatMap(NNDiagram.parseRegionToken);
  }

  static parseCoordList(s) {
    if (!s || !s.trim()) return [];
    return s.trim().split(/\s+/).map(NNDiagram.parseCoord);
  }

  static parseLabelList(s) {
    const map = new Map();
    if (!s || !s.trim()) return map;
    const tokens = s.trim().split(/\s+/);
    for (const tok of tokens) {
      const idx = tok.indexOf(':');
      if (idx === -1) continue;
      const coord = tok.substring(0, idx);
      const text = tok.substring(idx + 1);
      map.set(coord, text);
    }
    return map;
  }

  static parseStubs(s) {
    if (!s || s.trim() === '' || s.trim() === 'all') return new Set(['top', 'bottom', 'left', 'right']);
    if (s.trim() === 'none') return new Set();
    return new Set(s.trim().split(/[\s,]+/).map(v => v.toLowerCase()));
  }

  static key(x, y) { return `${x},${y}`; }

  render() {
    const regionsAttr = this.getAttribute('regions') || '';
    const shadedList = NNDiagram.parseCoordList(this.getAttribute('shaded'));
    const excludedList = NNDiagram.parseCoordList(this.getAttribute('excluded'));
    const unknownList = NNDiagram.parseCoordList(this.getAttribute('unknown'));
    const ishList = NNDiagram.parseCoordList(this.getAttribute('ish'));
    const labelMap = NNDiagram.parseLabelList(this.getAttribute('labels'));
    const stubSides = NNDiagram.parseStubs(this.getAttribute('continue'));

    // ── Read CSS custom properties ──
    const cs = getComputedStyle(this);
    const cssVar = (name, fallback) => {
      const v = cs.getPropertyValue(name).trim();
      return v || fallback;
    };
    const cssNum = (name, fallback) => {
      const v = parseFloat(cs.getPropertyValue(name));
      return isNaN(v) ? fallback : v;
    };

    const COL = {
      shaded:   cssVar('--nn-shaded', '#f0b429'),
      ish:      cssVar('--nn-ish', '#f5e6c8'),
      excluded: cssVar('--nn-excluded', '#c00'),
      unknown:  cssVar('--nn-unknown', '#bbb'),
      label:    cssVar('--nn-label', '#444'),
      grid:     cssVar('--nn-grid', '#999'),
      region:   cssVar('--nn-region-border', '#000'),
      cell:     cssVar('--nn-cell-bg', '#fff'),
      caption:  cssVar('--nn-caption', '#666'),
      checker:  cssVar('--nn-checker', '#c0c0c0'),
      error:    cssVar('--nn-error', '#e03030'),
    };
    const showErrors = this.hasAttribute('show-errors');
    const C     = cssNum('--nn-cell-size', 36);
    const THIN  = cssNum('--nn-grid-width', 1);
    const THICK = cssNum('--nn-region-width', 3);
    const checkerboard = this.hasAttribute('checkerboard');

    const regions = regionsAttr
      ? regionsAttr.split('|').map(NNDiagram.parseRegion)
      : [];

    const regionOf = new Map();
    regions.forEach((cells, ri) => {
      for (const c of cells) regionOf.set(NNDiagram.key(c.x, c.y), ri);
    });

    const allCells = [
      ...shadedList, ...excludedList, ...unknownList, ...ishList,
      ...regions.flat(),
      ...[...labelMap.keys()].map(NNDiagram.parseCoord)
    ];

    if (allCells.length === 0) {
      this.shadowRoot.innerHTML = '';
      return;
    }

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    for (const c of allCells) {
      minX = Math.min(minX, c.x); maxX = Math.max(maxX, c.x);
      minY = Math.min(minY, c.y); maxY = Math.max(maxY, c.y);
    }

    // Override bounding box with explicit extents if provided
    const extentsAttr = this.getAttribute('extents');
    if (extentsAttr) {
      const [from, to] = extentsAttr.split(':');
      const a = NNDiagram.parseCoord(from);
      const b = NNDiagram.parseCoord(to);
      minX = Math.min(minX, a.x); maxX = Math.max(maxX, b.x);
      minY = Math.min(minY, a.y); maxY = Math.max(maxY, b.y);
    }

    const pMinX = minX - 1, pMaxX = maxX + 1;
    const pMinY = minY - 1, pMaxY = maxY + 1;
    const contentCols = maxX - minX + 1;
    const contentRows = maxY - minY + 1;

    const stateMap = new Map();
    for (const c of shadedList) stateMap.set(NNDiagram.key(c.x, c.y), 'shaded');
    for (const c of excludedList) stateMap.set(NNDiagram.key(c.x, c.y), 'excluded');
    for (const c of unknownList) stateMap.set(NNDiagram.key(c.x, c.y), 'unknown');
    for (const c of ishList) stateMap.set(NNDiagram.key(c.x, c.y), 'ish');

    // ── Count shaded cells per region for error highlighting ──
    const shadedPerRegion = new Map();
    if (showErrors) {
      for (const c of shadedList) {
        const ri = regionOf.get(NNDiagram.key(c.x, c.y));
        if (ri !== undefined) shadedPerRegion.set(ri, (shadedPerRegion.get(ri) || 0) + 1);
      }
    }

    const HC = C / 2;
    // Total SVG size: half cell padding + content cells + half cell padding
    // Plus an extra half cell on each side for stubs to extend into
    const svgW = HC + HC + contentCols * C + HC + HC;
    const svgH = HC + HC + contentRows * C + HC + HC;

    // Offset everything so the content area starts at HC + HC
    const OX = HC;  // extra offset for stub space
    const OY = HC;

    // Pixel position helper: maps grid coord to pixel x/y (top-left of cell)
    const cellX = (gx) => {
      if (gx < minX) return OX;                              // left half-cell
      if (gx > maxX) return OX + HC + (gx - minX) * C;       // right half-cell
      return OX + HC + (gx - minX) * C;                       // content cell
    };
    const cellY = (gy) => {
      if (gy < minY) return OY;                               // top half-cell
      if (gy > maxY) return OY + HC + (gy - minY) * C;        // bottom half-cell
      return OY + HC + (gy - minY) * C;                        // content cell
    };
    const cellW = (gx) => (gx < minX || gx > maxX) ? HC : C;
    const cellH = (gy) => (gy < minY || gy > maxY) ? HC : C;

    let svg = '';

    // ── Cell backgrounds (non-shaded only) ──
    for (let gy = pMinY; gy <= pMaxY; gy++) {
      for (let gx = pMinX; gx <= pMaxX; gx++) {
        const k = NNDiagram.key(gx, gy);
        const inBBox = gx >= minX && gx <= maxX && gy >= minY && gy <= maxY;
        const state = stateMap.get(k);
        const px = cellX(gx);
        const py = cellY(gy);
        const cw = cellW(gx);
        const ch = cellH(gy);

        const isDark = (gx + gy) % 2 === 0;
        const cellBg = (checkerboard && inBBox) ? (isDark ? COL.checker : COL.cell) : (inBBox ? COL.cell : 'transparent');

        // Check if this cell's region has an error (shaded count ≠ 2)
        const ri = regionOf.get(k);
        const regionError = showErrors && ri !== undefined && shadedPerRegion.get(ri) !== 2;

        // Skip shaded/ish cells — they'll be drawn later as merged shapes
        if (state === 'shaded' || state === 'ish') {
          svg += `<rect x="${px}" y="${py}" width="${cw}" height="${ch}" fill="${cellBg}"/>`;
          if (regionError) svg += `<rect x="${px}" y="${py}" width="${cw}" height="${ch}" fill="${COL.error}" opacity="0.25"/>`;
          continue;
        }

        svg += `<rect x="${px}" y="${py}" width="${cw}" height="${ch}" fill="${cellBg}"/>`;
        if (regionError) svg += `<rect x="${px}" y="${py}" width="${cw}" height="${ch}" fill="${COL.error}" opacity="0.25"/>`;
      }
    }

    // Helper: find connected components of cells with a given state
    function findConnectedComponents(cells) {
      const cellSet = new Set(cells.map(c => NNDiagram.key(c.x, c.y)));
      const visited = new Set();
      const components = [];
      for (const c of cells) {
        const k = NNDiagram.key(c.x, c.y);
        if (visited.has(k)) continue;
        // BFS
        const component = [];
        const queue = [c];
        visited.add(k);
        while (queue.length) {
          const cur = queue.shift();
          component.push(cur);
          for (const [dx, dy] of [[1,0],[-1,0],[0,1],[0,-1]]) {
            const nk = NNDiagram.key(cur.x + dx, cur.y + dy);
            if (cellSet.has(nk) && !visited.has(nk)) {
              visited.add(nk);
              queue.push({ x: cur.x + dx, y: cur.y + dy });
            }
          }
        }
        components.push(component);
      }
      return components;
    }

    // Build merged paths for shaded and ish cells (drawn after gridlines)
    const shadedShapes = findConnectedComponents(shadedList);
    const ishShapes = findConnectedComponents(ishList);

    function buildMergedPath(cells) {
      // For each cell, trace its rect as a subpath
      // Using a single path with fill-rule ensures no overlap doubling
      let d = '';
      for (const c of cells) {
        const px = cellX(c.x);
        const py = cellY(c.y);
        const cw = cellW(c.x);
        const ch = cellH(c.y);
        d += `M${px},${py}h${cw}v${ch}h${-cw}z `;
      }
      return d;
    }

    // ── Gridlines with fading stubs ──
    // All cells in the bounding box are "content" for gridline purposes.
    const isContent = (gx, gy) => gx >= minX && gx <= maxX && gy >= minY && gy <= maxY;

    // Helper: draw a fading stub as a few short segments with decreasing opacity
    const STUB_LEN = HC;
    const STUB_SEGS = 4;
    const stubSegLen = STUB_LEN / STUB_SEGS;
    function drawStub(x1, y1, dx, dy) {
      let s = '';
      for (let i = 0; i < STUB_SEGS; i++) {
        const opacity = 1 - (i + 0.5) / STUB_SEGS;
        const sx = x1 + dx * stubSegLen * i;
        const sy = y1 + dy * stubSegLen * i;
        s += `<line x1="${sx}" y1="${sy}" x2="${sx + dx * stubSegLen}" y2="${sy + dy * stubSegLen}" stroke="${COL.grid}" stroke-width="${THIN}" opacity="${opacity.toFixed(2)}"/>`;
      }
      return s;
    }

    // Draw horizontal gridlines.
    for (let gy = minY; gy <= maxY + 1; gy++) {
      let runStart = -1;
      for (let gx = minX; gx <= maxX; gx++) {
        const above = gy > minY ? isContent(gx, gy - 1) : false;
        const below = gy <= maxY ? isContent(gx, gy) : false;
        const active = above || below;

        if (active && runStart === -1) runStart = gx;
        if ((!active || gx === maxX) && runStart !== -1) {
          const endGx = active ? gx : gx - 1;
          const x1 = cellX(runStart);
          const x2 = cellX(endGx) + cellW(endGx);
          const y = (gy <= maxY) ? cellY(gy) : cellY(maxY) + cellH(maxY);

          const isTopEdge = (gy === minY);
          const isBottomEdge = (gy === maxY + 1);
          const hLineW = ((isTopEdge && !stubSides.has('top')) || (isBottomEdge && !stubSides.has('bottom'))) ? THIN * 2 : THIN;
          svg += `<line x1="${x1}" y1="${y}" x2="${x2}" y2="${y}" stroke="${COL.grid}" stroke-width="${hLineW}"/>`;
          if (stubSides.has('left'))  svg += drawStub(x1, y, -1, 0); // left stub
          if (stubSides.has('right')) svg += drawStub(x2, y, 1, 0);  // right stub

          runStart = -1;
        }
      }
    }

    // Draw vertical gridlines.
    for (let gx = minX; gx <= maxX + 1; gx++) {
      let runStart = -1;
      for (let gy = minY; gy <= maxY; gy++) {
        const left = gx > minX ? isContent(gx - 1, gy) : false;
        const right = gx <= maxX ? isContent(gx, gy) : false;
        const active = left || right;

        if (active && runStart === -1) runStart = gy;
        if ((!active || gy === maxY) && runStart !== -1) {
          const endGy = active ? gy : gy - 1;
          const y1 = cellY(runStart);
          const y2 = cellY(endGy) + cellH(endGy);
          const x = (gx <= maxX) ? cellX(gx) : cellX(maxX) + cellW(maxX);

          const isLeftEdge = (gx === minX);
          const isRightEdge = (gx === maxX + 1);
          const vLineW = ((isLeftEdge && !stubSides.has('left')) || (isRightEdge && !stubSides.has('right'))) ? THIN * 2 : THIN;
          svg += `<line x1="${x}" y1="${y1}" x2="${x}" y2="${y2}" stroke="${COL.grid}" stroke-width="${vLineW}"/>`;
          if (stubSides.has('top'))    svg += drawStub(x, y1, 0, -1); // top stub
          if (stubSides.has('bottom')) svg += drawStub(x, y2, 0, 1);  // bottom stub

          runStart = -1;
        }
      }
    }

    // ── Shaded overlays (semi-transparent, drawn over gridlines) ──
    for (const comp of shadedShapes) {
      svg += `<path d="${buildMergedPath(comp)}" fill="${COL.shaded}" style="mix-blend-mode:multiply" fill-rule="nonzero"/>`;
    }
    for (const comp of ishShapes) {
      svg += `<path d="${buildMergedPath(comp)}" fill="${COL.ish}" style="mix-blend-mode:multiply" fill-rule="nonzero"/>`;
    }

    // ── Cell content (text) — only for full-size content cells ──
    for (let gy = minY; gy <= maxY; gy++) {
      for (let gx = minX; gx <= maxX; gx++) {
        const k = NNDiagram.key(gx, gy);
        const state = stateMap.get(k);
        const label = labelMap.get(k);
        const cx = cellX(gx) + C / 2;
        const cy = cellY(gy) + C / 2;

        let text = '';
        let fill = '';
        let fontSize = Math.round(C * 0.47);  // default
        let fontStyle = '';

        if (label) {
          text = label;
          fill = (state === 'shaded' || state === 'ish') ? COL.cell : COL.label;
          fontSize = Math.round(C * 0.36);
        } else if (state === 'excluded') {
          text = '\u2715';
          fill = COL.excluded;
          fontSize = Math.round(C * 0.42);
        } else if (state === 'unknown') {
          text = '?';
          fill = COL.unknown;
          fontSize = Math.round(C * 0.47);
          fontStyle = ' font-style="italic"';
        }

        if (text) {
          svg += `<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-family="'Segoe UI', system-ui, sans-serif" font-weight="bold" font-size="${fontSize}" fill="${fill}"${fontStyle}>${text}</text>`;
        }
      }
    }

    // ── Region borders (thick) — traced as closed contour paths ──
    // For each region, trace the outer boundary as a single path to avoid
    // overlapping segments at corners.
    function traceRegionContour(regionCells, ri) {
      // Build a set of cells in this region
      const cellSet = new Set(regionCells.map(c => NNDiagram.key(c.x, c.y)));

      // Collect all boundary edges as directed segments (going clockwise).
      // Each edge is between a cell in the region and a cell outside it.
      // We store edges as grid-corner coordinates: each cell (gx,gy) occupies
      // corners (gx,gy)-(gx+1,gy+1) in corner-space.
      const edges = [];
      for (const c of regionCells) {
        const { x: gx, y: gy } = c;
        // Top edge: if cell above is not in region
        if (!cellSet.has(NNDiagram.key(gx, gy - 1))) {
          edges.push({ x1: gx, y1: gy, x2: gx + 1, y2: gy }); // left to right
        }
        // Bottom edge
        if (!cellSet.has(NNDiagram.key(gx, gy + 1))) {
          edges.push({ x1: gx + 1, y1: gy + 1, x2: gx, y2: gy + 1 }); // right to left
        }
        // Left edge
        if (!cellSet.has(NNDiagram.key(gx - 1, gy))) {
          edges.push({ x1: gx, y1: gy + 1, x2: gx, y2: gy }); // bottom to top
        }
        // Right edge
        if (!cellSet.has(NNDiagram.key(gx + 1, gy))) {
          edges.push({ x1: gx + 1, y1: gy, x2: gx + 1, y2: gy + 1 }); // top to bottom
        }
      }

      // Chain edges into closed loops.
      // Build adjacency: from endpoint -> list of edges starting there
      const edgeMap = new Map();
      for (const e of edges) {
        const k = e.x1 + ',' + e.y1;
        if (!edgeMap.has(k)) edgeMap.set(k, []);
        edgeMap.get(k).push(e);
      }

      const used = new Set();
      const paths = [];

      for (const e of edges) {
        const eid = `${e.x1},${e.y1}-${e.x2},${e.y2}`;
        if (used.has(eid)) continue;

        const loop = [];
        let cur = e;
        while (cur) {
          const cid = `${cur.x1},${cur.y1}-${cur.x2},${cur.y2}`;
          if (used.has(cid)) break;
          used.add(cid);
          loop.push(cur);
          // Find next edge starting at cur's endpoint
          const nextKey = cur.x2 + ',' + cur.y2;
          const candidates = edgeMap.get(nextKey) || [];
          cur = candidates.find(c => !used.has(`${c.x1},${c.y1}-${c.x2},${c.y2}`));
        }

        if (loop.length > 0) paths.push(loop);
      }

      // Convert grid-corner coords to pixel coords and build SVG path
      function cornerToPixel(cx, cy) {
        // Corner (cx, cy) in grid-corner space maps to the intersection
        // of gridlines at column cx, row cy
        const px = (cx >= minX && cx <= maxX + 1)
          ? cellX(Math.min(cx, maxX)) + (cx > maxX ? cellW(maxX) : 0)
          : (cx < minX ? cellX(minX) : cellX(maxX) + cellW(maxX));
        const py = (cy >= minY && cy <= maxY + 1)
          ? cellY(Math.min(cy, maxY)) + (cy > maxY ? cellH(maxY) : 0)
          : (cy < minY ? cellY(minY) : cellY(maxY) + cellH(maxY));
        return { px, py };
      }

      // Simpler corner mapping: corner (cx, cy) is at the top-left of cell (cx, cy)
      function ctp(cx, cy) {
        // x position
        let px;
        if (cx <= minX) px = cellX(minX);
        else if (cx > maxX) px = cellX(maxX) + cellW(maxX);
        else px = cellX(cx);
        // y position
        let py;
        if (cy <= minY) py = cellY(minY);
        else if (cy > maxY) py = cellY(maxY) + cellH(maxY);
        else py = cellY(cy);
        return { px, py };
      }

      let d = '';
      for (const loop of paths) {
        const start = ctp(loop[0].x1, loop[0].y1);
        d += `M${start.px},${start.py}`;
        for (const seg of loop) {
          const end = ctp(seg.x2, seg.y2);
          d += `L${end.px},${end.py}`;
        }
        d += 'Z ';
      }

      return d;
    }

    // Group cells by region index and draw each region's contour
    const regionGroups = new Map();
    for (const [k, ri] of regionOf) {
      if (!regionGroups.has(ri)) regionGroups.set(ri, []);
      regionGroups.get(ri).push(NNDiagram.parseCoord(k));
    }

    for (const [ri, cells] of regionGroups) {
      const d = traceRegionContour(cells, ri);
      const regionErr = showErrors && shadedPerRegion.get(ri) !== 2;
      const strokeCol = regionErr ? COL.error : COL.region;
      svg += `<path d="${d}" fill="none" stroke="${strokeCol}" stroke-width="${THICK}" stroke-linejoin="round"/>`;
    }

    const fullSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">${svg}</svg>`;

    // ── Baseline alignment ──
    // If baseline attribute is set, offset so that row's center is at
    // the element's vertical midpoint. Default: center of content area.
    const baselineAttr = this.getAttribute('baseline');
    const svgCenter = svgH / 2;
    let baselineY;
    if (baselineAttr) {
      const bRow = parseFloat(baselineAttr);
      // Center of the specified row
      baselineY = cellY(bRow) + C / 2;
    } else {
      // Default: center of the content area
      baselineY = cellY(minY) + (contentRows * C) / 2;
    }
    const offset = svgCenter - baselineY;
    const marginStyle = offset !== 0
      ? `margin-top: ${-offset}px; margin-bottom: ${offset}px;`
      : '';

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: inline-flex; flex-direction: column; align-items: center; gap: 4px; }
        .wrap { ${marginStyle} }
      </style>
      <div class="wrap">${fullSVG}</div>
    `;
  }
}

customElements.define('nn-diagram', NNDiagram);

class NNSequence extends HTMLElement {
  static get observedAttributes() {
    return ['captions', 'before-caption', 'after-caption'];
  }

  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
  }

  connectedCallback() { this.syncExtents(); this.render(); }
  attributeChangedCallback() { this.render(); }

  syncExtents() {
    const diagrams = [...this.querySelectorAll('nn-diagram')];
    if (diagrams.length < 2) return;

    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

    for (const d of diagrams) {
      const attrs = ['regions', 'shaded', 'excluded', 'unknown', 'ish', 'labels', 'extents'];
      for (const attr of attrs) {
        const val = d.getAttribute(attr);
        if (!val) continue;
        const coords = val.match(/\d+,\d+/g);
        if (!coords) continue;
        for (const c of coords) {
          const [x, y] = c.split(',').map(Number);
          minX = Math.min(minX, x); maxX = Math.max(maxX, x);
          minY = Math.min(minY, y); maxY = Math.max(maxY, y);
        }
      }
    }

    if (minX === Infinity) return;

    const ext = `${minX},${minY}:${maxX},${maxY}`;
    for (const d of diagrams) {
      d.setAttribute('extents', ext);
    }
  }

  render() {
    const diagrams = [...this.querySelectorAll('nn-diagram')];
    const n = diagrams.length;
    if (n === 0) return;

    // Parse captions: new pipe-delimited attribute, or legacy before-caption / after-caption
    let captions;
    const captionsAttr = this.getAttribute('captions');
    if (captionsAttr) {
      captions = captionsAttr.split('|').map(s => s.trim());
    } else {
      const bc = this.getAttribute('before-caption') || '';
      const ac = this.getAttribute('after-caption') || '';
      captions = [bc, ac];
    }

    // Assign slot names to each diagram
    diagrams.forEach((d, i) => d.setAttribute('slot', `d${i}`));

    // Build grid columns: diagram, arrow, diagram, arrow, ..., diagram
    const colTemplate = Array.from({ length: n }, () => 'auto').join(' auto ');
    // Total columns: n diagrams + (n-1) arrows = 2n - 1
    const totalCols = 2 * n - 1;

    let slotsHTML = '';
    let captionsHTML = '';
    let slotStyles = '';

    for (let i = 0; i < n; i++) {
      const col = i * 2 + 1; // 1-based CSS grid column
      slotsHTML += `<slot name="d${i}"></slot>`;
      slotStyles += `slot[name="d${i}"] { grid-row: 1; grid-column: ${col}; display: flex; justify-content: center; }\n`;

      if (captions[i]) {
        captionsHTML += `<div class="cap" style="grid-column: ${col};">${captions[i]}</div>`;
      }

      if (i < n - 1) {
        slotsHTML += `<div class="arrow" style="grid-column: ${col + 1};">→</div>`;
      }
    }

    this.shadowRoot.innerHTML = `
      <style>
        :host { display: inline-grid; grid-template-columns: ${colTemplate}; grid-template-rows: auto auto; gap: 0 12px; }
        .arrow { font-size: 26px; color: #999; grid-row: 1; text-align: center; align-self: center; }
        ${slotStyles}
        .cap { grid-row: 2; font-family: 'Segoe UI', system-ui, sans-serif; font-size: .78em; color: #666; font-style: italic; text-align: center; max-width: 180px; justify-self: center; margin-top: 4px; }
      </style>
      ${slotsHTML}
      ${captionsHTML}
    `;
  }
}

customElements.define('nn-sequence', NNSequence);
// Backwards compatibility
customElements.define('nn-transition', class extends NNSequence {});
