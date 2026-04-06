# nn-diagram Web Components

[Norinori](https://www.nikoli.co.jp/en/puzzles/norinori/) is a binary-shading puzzle by Nikoli. The grid is divided into regions, and the goal is to shade exactly two cells in every region such that every shaded cell is part of a horizontal or vertical domino (a pair of adjacent shaded cells).

These web components render Norinori diagrams as inline SVGs — no dependencies, just drop `nn-diagram.js` into your page.

```html
<script src="nn-diagram.js"></script>
```

## `<nn-diagram>`

Renders a single puzzle grid as an inline SVG.

```html
<nn-diagram
  regions="1,1 1,2 2,2 | 2,1 3,1"
  shaded="1,1 1,2"
  excluded="2,2"
></nn-diagram>
```

### Attributes

| Attribute | Description |
|-----------|-------------|
| `regions` | Pipe-separated (`\|`) region definitions. Each region is a space-separated list of `x,y` coordinates or `x1,y1:x2,y2` ranges. |
| `shaded` | Space-separated coordinates of shaded (filled) cells. |
| `excluded` | Space-separated coordinates of excluded cells (shown with ✕). |
| `unknown` | Space-separated coordinates of unknown cells (shown with ?). |
| `ish` | Space-separated coordinates of "ish" cells (lighter fill). |
| `labels` | Space-separated `x,y:text` pairs for cell labels. |
| `checkerboard` | Boolean. Alternates cell background colors. |
| `show-errors` | Boolean. Highlights regions that don't have exactly 2 shaded cells. |
| `continue` | Which sides extend fading gridline stubs beyond the grid edge. Values: `"all"` (default), `"none"`, or a space-separated subset of `top`, `bottom`, `left`, `right`. |
| `extents` | Force the bounding box with `x1,y1:x2,y2`. Useful for aligning multiple diagrams. |
| `baseline` | Row number whose center is used for vertical alignment. |

### CSS Custom Properties

All rendering is controlled through CSS custom properties, so you can theme or resize diagrams from a parent element.

| Property | Default | Description |
|----------|---------|-------------|
| `--nn-cell-size` | `36` | Cell width/height in pixels |
| `--nn-grid-width` | `1` | Thin gridline width |
| `--nn-region-width` | `3` | Thick region border width |
| `--nn-shaded` | `#f0b429` | Shaded cell fill |
| `--nn-ish` | `#f5e6c8` | Ish cell fill |
| `--nn-excluded` | `#c00` | Excluded marker color |
| `--nn-unknown` | `#bbb` | Unknown marker color |
| `--nn-label` | `#444` | Label text color |
| `--nn-grid` | `#999` | Gridline color |
| `--nn-region-border` | `#000` | Region boundary color |
| `--nn-cell-bg` | `#fff` | Cell background |
| `--nn-checker` | `#c0c0c0` | Checkerboard dark cell color |
| `--nn-error` | `#e03030` | Error highlight color |

```html
<div style="--nn-cell-size: 48; --nn-region-width: 4;">
  <nn-diagram regions="1,1:3,3" shaded="1,1 2,1"></nn-diagram>
</div>
```

## `<nn-sequence>`

Lays out multiple `<nn-diagram>` elements in a row with arrow separators and optional captions. Automatically syncs `extents` across all child diagrams so they share a consistent bounding box.

```html
<nn-sequence captions="Before | After">
  <nn-diagram regions="1,1 2,1 3,1" unknown="1,1 2,1 3,1"></nn-diagram>
  <nn-diagram regions="1,1 2,1 3,1" shaded="1,1 2,1" excluded="3,1"></nn-diagram>
</nn-sequence>
```

### Attributes

| Attribute | Description |
|-----------|-------------|
| `captions` | Pipe-separated captions, one per diagram (e.g., `"Start \| Middle \| End"`). |

`<nn-transition>` is an alias for `<nn-sequence>`.

## Coordinate System

Cells are addressed as `x,y` where x is the column (left to right) and y is the row (top to bottom), starting at 1.

Ranges use colon notation: `1,1:3,2` expands to all cells in the rectangle from (1,1) to (3,2).

Regions are separated by `|`:

```
regions="1,1 1,2 1,3 | 2,1 2,2 | 3,1:4,2"
```

## Test Page

Open [nn-diagram-test.html](nn-diagram-test.html) for interactive examples of all features.
