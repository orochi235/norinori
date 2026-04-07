class NNDiagram extends HTMLElement {
  static get observedAttributes() {
    return ['regions', 'shaded', 'excluded', 'unknown', 'ish', 'labels', 'baseline', 'checkerboard', 'extents', 'viewport', 'continue', 'show-errors'];
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

    // Viewport: clip rendering to a subrectangle of the puzzle.
    // Cells and region data outside the viewport are still used for
    // determining region topology, but are not rendered.
    const viewportAttr = this.getAttribute('viewport');
    let viewport = null;
    if (viewportAttr) {
      const [from, to] = viewportAttr.split(':');
      const a = NNDiagram.parseCoord(from);
      const b = NNDiagram.parseCoord(to);
      viewport = {
        minX: Math.min(a.x, b.x), maxX: Math.max(a.x, b.x),
        minY: Math.min(a.y, b.y), maxY: Math.max(a.y, b.y),
      };
      minX = viewport.minX; maxX = viewport.maxX;
      minY = viewport.minY; maxY = viewport.maxY;
    }
    const inViewport = (x, y) =>
      !viewport || (x >= viewport.minX && x <= viewport.maxX &&
                    y >= viewport.minY && y <= viewport.maxY);

    // ── Fade-strip detection ──
    // For each clipped viewport side, if the row/column immediately beyond
    // contains any puzzle data (region, shaded, excluded, unknown, ish, label),
    // mark that side as a "fade side". Fade sides render a half-cell-deep
    // strip of the adjacent content faded out toward the outer edge.
    const fadeSides = new Set();
    if (viewport) {
      const hasDataAt = (x, y) => {
        const k = NNDiagram.key(x, y);
        if (regionOf.has(k)) return true;
        for (const c of shadedList)   if (c.x === x && c.y === y) return true;
        for (const c of excludedList) if (c.x === x && c.y === y) return true;
        for (const c of unknownList)  if (c.x === x && c.y === y) return true;
        for (const c of ishList)      if (c.x === x && c.y === y) return true;
        if (labelMap.has(k)) return true;
        return false;
      };
      const rowHasData = (y) => {
        for (let x = viewport.minX; x <= viewport.maxX; x++)
          if (hasDataAt(x, y)) return true;
        return false;
      };
      const colHasData = (x) => {
        for (let y = viewport.minY; y <= viewport.maxY; y++)
          if (hasDataAt(x, y)) return true;
        return false;
      };
      if (rowHasData(viewport.minY - 1)) fadeSides.add('top');
      if (rowHasData(viewport.maxY + 1)) fadeSides.add('bottom');
      if (colHasData(viewport.minX - 1)) fadeSides.add('left');
      if (colHasData(viewport.maxX + 1)) fadeSides.add('right');
    }

    // Continue/stub sides become empty fade strips on any side that isn't
    // already a viewport fade side. They extend the rendered area by a half
    // cell with gridlines and cell backgrounds (no region/marker data) and
    // are faded by the same gradient mask.
    for (const side of ['top', 'bottom', 'left', 'right']) {
      if (stubSides.has(side) && !fadeSides.has(side)) fadeSides.add(side);
    }

    // Effective bounds: extend by 1 on each fade side. The ring cells on
    // fade sides become "content" for rendering purposes.
    const eMinX = minX - (fadeSides.has('left')   ? 1 : 0);
    const eMaxX = maxX + (fadeSides.has('right')  ? 1 : 0);
    const eMinY = minY - (fadeSides.has('top')    ? 1 : 0);
    const eMaxY = maxY + (fadeSides.has('bottom') ? 1 : 0);
    const inFadeStrip = (x, y) =>
      (fadeSides.has('top')    && y === minY - 1 && x >= eMinX && x <= eMaxX) ||
      (fadeSides.has('bottom') && y === maxY + 1 && x >= eMinX && x <= eMaxX) ||
      (fadeSides.has('left')   && x === minX - 1 && y >= eMinY && y <= eMaxY) ||
      (fadeSides.has('right')  && x === maxX + 1 && y >= eMinY && y <= eMaxY);
    const inExtViewport = (x, y) =>
      !viewport || (x >= eMinX && x <= eMaxX && y >= eMinY && y <= eMaxY);

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
        const inStrip = inFadeStrip(gx, gy);
        const renderCell = inBBox || inStrip;
        const state = stateMap.get(k);
        const px = cellX(gx);
        const py = cellY(gy);
        const cw = cellW(gx);
        const ch = cellH(gy);

        const isDark = (gx + gy) % 2 === 0;
        const cellBg = (checkerboard && renderCell) ? (isDark ? COL.checker : COL.cell) : (renderCell ? COL.cell : 'transparent');

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
    // All cells in the (effective) bounding box are "content" for gridline
    // purposes. Effective bounds extend by 1 on fade sides so the strip
    // gets gridlines too.
    const isContent = (gx, gy) => gx >= eMinX && gx <= eMaxX && gy >= eMinY && gy <= eMaxY;

    let hardEdgeSvg = '';

    const fadeTop    = fadeSides.has('top');
    const fadeBottom = fadeSides.has('bottom');
    const fadeLeft   = fadeSides.has('left');
    const fadeRight  = fadeSides.has('right');

    // Draw horizontal gridlines.
    for (let gy = eMinY; gy <= eMaxY + 1; gy++) {
      // Skip the outermost gridline on fade sides — the strip should fade
      // to nothing, not end with a boundary line.
      if (fadeTop && gy === eMinY) continue;
      if (fadeBottom && gy === eMaxY + 1) continue;
      let runStart = -1;
      for (let gx = eMinX; gx <= eMaxX; gx++) {
        const above = gy > eMinY ? isContent(gx, gy - 1) : false;
        const below = gy <= eMaxY ? isContent(gx, gy) : false;
        const active = above || below;

        if (active && runStart === -1) runStart = gx;
        if ((!active || gx === eMaxX) && runStart !== -1) {
          const endGx = active ? gx : gx - 1;
          const x1 = cellX(runStart);
          const x2 = cellX(endGx) + cellW(endGx);
          const y = (gy <= eMaxY) ? cellY(gy) : cellY(eMaxY) + cellH(eMaxY);

          const isTopEdge = (gy === eMinY);
          const isBottomEdge = (gy === eMaxY + 1);
          const isHardEdge =
            (isTopEdge    && !fadeTop) ||
            (isBottomEdge && !fadeBottom);
          const hLineW = isHardEdge ? 6 : THIN;
          const hStroke = isHardEdge ? '#000' : COL.grid;
          // Offset so the hard edge's inner face sits just inside the region
          // contour (covering its outer half), aligning with y ± THICK/2.
          const hardOffset = hLineW / 2 - THICK / 2;
          const hy = isHardEdge ? (isTopEdge ? y - hardOffset : y + hardOffset) : y;
          // Extend hard edges at corners so they reach the outer face of the
          // adjacent vertical hard edge (distance = hLineW - THICK/2 from the
          // cell boundary).
          const hCornerExt = hLineW - THICK / 2;
          const hx1 = (isHardEdge && !fadeLeft  && runStart === eMinX) ? x1 - hCornerExt : x1;
          const hx2 = (isHardEdge && !fadeRight && endGx   === eMaxX) ? x2 + hCornerExt : x2;
          const hLine = `<line x1="${hx1}" y1="${hy}" x2="${hx2}" y2="${hy}" stroke="${hStroke}" stroke-width="${hLineW}"/>`;
          if (isHardEdge) hardEdgeSvg += hLine; else svg += hLine;

          runStart = -1;
        }
      }
    }

    // Draw vertical gridlines.
    for (let gx = eMinX; gx <= eMaxX + 1; gx++) {
      if (fadeLeft && gx === eMinX) continue;
      if (fadeRight && gx === eMaxX + 1) continue;
      let runStart = -1;
      for (let gy = eMinY; gy <= eMaxY; gy++) {
        const left = gx > eMinX ? isContent(gx - 1, gy) : false;
        const right = gx <= eMaxX ? isContent(gx, gy) : false;
        const active = left || right;

        if (active && runStart === -1) runStart = gy;
        if ((!active || gy === eMaxY) && runStart !== -1) {
          const endGy = active ? gy : gy - 1;
          const y1 = cellY(runStart);
          const y2 = cellY(endGy) + cellH(endGy);
          const x = (gx <= eMaxX) ? cellX(gx) : cellX(eMaxX) + cellW(eMaxX);

          const isLeftEdge = (gx === eMinX);
          const isRightEdge = (gx === eMaxX + 1);
          const isHardEdgeV =
            (isLeftEdge  && !fadeLeft) ||
            (isRightEdge && !fadeRight);
          const vLineW = isHardEdgeV ? 6 : THIN;
          const vStroke = isHardEdgeV ? '#000' : COL.grid;
          const hardOffsetV = vLineW / 2 - THICK / 2;
          const vx = isHardEdgeV ? (isLeftEdge ? x - hardOffsetV : x + hardOffsetV) : x;
          const vCornerExt = vLineW - THICK / 2;
          const vy1 = (isHardEdgeV && !fadeTop    && runStart === eMinY) ? y1 - vCornerExt : y1;
          const vy2 = (isHardEdgeV && !fadeBottom && endGy    === eMaxY) ? y2 + vCornerExt : y2;
          const vLine = `<line x1="${vx}" y1="${vy1}" x2="${vx}" y2="${vy2}" stroke="${vStroke}" stroke-width="${vLineW}"/>`;
          if (isHardEdgeV) hardEdgeSvg += vLine; else svg += vLine;

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

    // ── Cell content (text) — content cells plus fade-strip ring cells ──
    for (let gy = pMinY; gy <= pMaxY; gy++) {
      for (let gx = pMinX; gx <= pMaxX; gx++) {
        const inBBox = gx >= minX && gx <= maxX && gy >= minY && gy <= maxY;
        if (!inBBox && !inFadeStrip(gx, gy)) continue;
        const k = NNDiagram.key(gx, gy);
        const state = stateMap.get(k);
        const label = labelMap.get(k);
        // Center text where it would be in a full-size cell, even in
        // half-size fade-strip ring cells. The mask fades the half that
        // lies outside the viewport.
        const cx = (gx < minX) ? cellX(gx) + HC - C/2
                : (gx > maxX) ? cellX(gx) + C/2
                              : cellX(gx) + C/2;
        const cy = (gy < minY) ? cellY(gy) + HC - C/2
                : (gy > maxY) ? cellY(gy) + C/2
                              : cellY(gy) + C/2;

        let text = '';
        let fill = '';
        let fontSize = Math.round(C * 0.47);  // default
        let fontStyle = '';

        if (label) {
          text = label;
          fill = (state === 'shaded' || state === 'ish') ? COL.cell : COL.label;
          fontSize = Math.round(C * 0.36);
        } else if (state === 'excluded') {
          // Draw the X as two SVG lines for crisp control over size & weight.
          const r = C * 0.18;
          const sw = Math.max(2, Math.round(C * 0.09));
          svg += `<line x1="${cx - r}" y1="${cy - r}" x2="${cx + r}" y2="${cy + r}" stroke="${COL.excluded}" stroke-width="${sw}"/>`;
          svg += `<line x1="${cx - r}" y1="${cy + r}" x2="${cx + r}" y2="${cy - r}" stroke="${COL.excluded}" stroke-width="${sw}"/>`;
          continue;
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
      // Skip an edge that lies entirely on a fade-side's outer clip line —
      // it's a spurious seam introduced by clamping the region trace to the
      // extended-viewport bounds, not a real region border.
      const fT2 = fadeSides.has('top'), fB2 = fadeSides.has('bottom');
      const fL2 = fadeSides.has('left'), fR2 = fadeSides.has('right');
      const skipClipEdge = (e) =>
        (fB2 && e.y1 > eMaxY && e.y2 > eMaxY) ||
        (fT2 && e.y1 <= eMinY && e.y2 <= eMinY) ||
        (fR2 && e.x1 > eMaxX && e.x2 > eMaxX) ||
        (fL2 && e.x1 <= eMinX && e.x2 <= eMinX);
      const pushEdge = (e) => { if (!skipClipEdge(e)) edges.push(e); };
      for (const c of regionCells) {
        const { x: gx, y: gy } = c;
        // Skip cells entirely outside the extended viewport — their edges
        // would be clamped to the clip boundary and create spurious seams.
        if (viewport && !inExtViewport(gx, gy)) continue;
        if (!cellSet.has(NNDiagram.key(gx, gy - 1))) {
          pushEdge({ x1: gx, y1: gy, x2: gx + 1, y2: gy });
        }
        if (!cellSet.has(NNDiagram.key(gx, gy + 1))) {
          pushEdge({ x1: gx + 1, y1: gy + 1, x2: gx, y2: gy + 1 });
        }
        if (!cellSet.has(NNDiagram.key(gx - 1, gy))) {
          pushEdge({ x1: gx, y1: gy + 1, x2: gx, y2: gy });
        }
        if (!cellSet.has(NNDiagram.key(gx + 1, gy))) {
          pushEdge({ x1: gx + 1, y1: gy, x2: gx + 1, y2: gy + 1 });
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
        // Clamp to the extended viewport (viewport + fade-strip ring) so that
        // region borders extending into the fade strip get real coordinates
        // and are masked out smoothly, instead of being clamped to the
        // viewport edge (which would draw a spurious closing line).
        let px;
        if (cx <= eMinX) px = cellX(eMinX);
        else if (cx > eMaxX) px = cellX(eMaxX) + cellW(eMaxX);
        else px = cellX(cx);
        let py;
        if (cy <= eMinY) py = cellY(eMinY);
        else if (cy > eMaxY) py = cellY(eMaxY) + cellH(eMaxY);
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
        // Only close the path if the loop actually returns to its start
        // (open chains occur when viewport clipping cuts a region).
        const last = loop[loop.length - 1];
        if (last.x2 === loop[0].x1 && last.y2 === loop[0].y1) d += 'Z ';
        d += ' ';
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

    svg += hardEdgeSvg;

    // ── Fade-strip mask ──
    // Cover the whole SVG with white (visible), then overlay each fade-side
    // strip with a linear gradient that fades to black at the outer edge.
    let defsContent = '';
    let body = svg;
    if (fadeSides.size > 0) {
      const uid = 'nnfm' + Math.random().toString(36).slice(2, 9);
      // Strip pixel ranges (the strip is exactly the half-cell padding ring
      // immediately outside the viewport).
      const innerLeft   = cellX(minX);
      const innerRight  = cellX(maxX) + cellW(maxX);
      const innerTop    = cellY(minY);
      const innerBottom = cellY(maxY) + cellH(maxY);

      const fT = fadeSides.has('top');
      const fB = fadeSides.has('bottom');
      const fL = fadeSides.has('left');
      const fR = fadeSides.has('right');

      let gradients = '';
      let maskRects = `<rect x="0" y="0" width="${svgW}" height="${svgH}" fill="white"/>`;
      // Black-out everything beyond each fade strip's outer edge so that
      // text glyphs and stray geometry don't leak into the unmasked area.
      if (fT) maskRects += `<rect x="0" y="0" width="${svgW}" height="${innerTop - HC}" fill="black"/>`;
      if (fB) maskRects += `<rect x="0" y="${innerBottom + HC}" width="${svgW}" height="${svgH - (innerBottom + HC)}" fill="black"/>`;
      if (fL) maskRects += `<rect x="0" y="0" width="${innerLeft - HC}" height="${svgH}" fill="black"/>`;
      if (fR) maskRects += `<rect x="${innerRight + HC}" y="0" width="${svgW - (innerRight + HC)}" height="${svgH}" fill="black"/>`;
      // Side strips are clipped horizontally/vertically to the inner span,
      // so corners are handled separately with a radial gradient.
      // A side strip extends into an adjacent corner only if the perpendicular
      // side is NOT itself a fade side. (When two fade sides meet, the corner
      // is handled separately by a radial gradient.)
      if (fT) {
        const x0 = fL ? innerLeft  : innerLeft  - HC;
        const x1 = fR ? innerRight : innerRight + HC;
        gradients += `<linearGradient id="${uid}t" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>`;
        maskRects += `<rect x="${x0}" y="${innerTop - HC}" width="${x1 - x0}" height="${HC}" fill="url(#${uid}t)"/>`;
      }
      if (fB) {
        const x0 = fL ? innerLeft  : innerLeft  - HC;
        const x1 = fR ? innerRight : innerRight + HC;
        gradients += `<linearGradient id="${uid}b" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>`;
        maskRects += `<rect x="${x0}" y="${innerBottom}" width="${x1 - x0}" height="${HC}" fill="url(#${uid}b)"/>`;
      }
      if (fL) {
        const y0 = fT ? innerTop    : innerTop    - HC;
        const y1 = fB ? innerBottom : innerBottom + HC;
        gradients += `<linearGradient id="${uid}l" x1="1" y1="0" x2="0" y2="0"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>`;
        maskRects += `<rect x="${innerLeft - HC}" y="${y0}" width="${HC}" height="${y1 - y0}" fill="url(#${uid}l)"/>`;
      }
      if (fR) {
        const y0 = fT ? innerTop    : innerTop    - HC;
        const y1 = fB ? innerBottom : innerBottom + HC;
        gradients += `<linearGradient id="${uid}r" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="black"/></linearGradient>`;
        maskRects += `<rect x="${innerRight}" y="${y0}" width="${HC}" height="${y1 - y0}" fill="url(#${uid}r)"/>`;
      }
      // Corner pieces: a radial gradient centered at the inner corner.
      // Used wherever two adjacent fade sides meet, so the fade is smooth
      // and rotationally symmetric in the corner.
      const corner = (id, cx, cy, x, y) => {
        gradients += `<radialGradient id="${id}" cx="${cx}" cy="${cy}" r="${HC}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="white"/><stop offset="1" stop-color="black"/></radialGradient>`;
        maskRects += `<rect x="${x}" y="${y}" width="${HC}" height="${HC}" fill="url(#${id})"/>`;
      };
      if (fT && fL) corner(`${uid}tl`, innerLeft,  innerTop,    innerLeft - HC,  innerTop - HC);
      if (fT && fR) corner(`${uid}tr`, innerRight, innerTop,    innerRight,      innerTop - HC);
      if (fB && fL) corner(`${uid}bl`, innerLeft,  innerBottom, innerLeft - HC,  innerBottom);
      if (fB && fR) corner(`${uid}br`, innerRight, innerBottom, innerRight,      innerBottom);
      defsContent = `<defs>${gradients}<mask id="${uid}m" maskUnits="userSpaceOnUse">${maskRects}</mask></defs>`;
      body = `<g mask="url(#${uid}m)">${svg}</g>`;
    }

    const fullSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="${svgW}" height="${svgH}" viewBox="0 0 ${svgW} ${svgH}">${defsContent}${body}</svg>`;

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
