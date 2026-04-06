# Norinori Lemmas — Session Context

Full context dump from the Claude conversation that produced this project.
Use this to resume work in a new session or in Claude Code.

---

## Project Overview

A reference document for Norinori puzzle solving techniques, built around a custom SVG web component (`nn-diagram`) for rendering puzzle diagrams.

**Repo**: `~/src/norinori/`
**Files**:
- `index.html` — main reference document (all lemmas)
- `nn-diagram.js` — standalone component source
- `nn-diagram-test.html` — component test page (~12 test cases)
- `README.md` — component documentation

---

## Coordinate System

- Origin: top-left, 1-indexed
- Format: `x,y` (column, row), x→right, y→down
- Example: in a 3×3 grid, top-left is (1,1), bottom-right is (3,3)

## Pattern Shorthand (for conversation)

- `O` = shaded, `X` = excluded, `?` or `_` = undetermined
- Example: `O?O => OXO` means ends shaded forces middle unshaded
- Multi-row: use `/` as row separator

## Terminology

| Term | Meaning |
|------|---------|
| **domino** | Pair of orthogonally adjacent shaded cells |
| **group/region** | Area bounded by thick borders (attribute: `regions`) |
| **shaded** | Filled cell (golden manila `#f0b429`) |
| **excluded** | Known unshaded (red ✕) |
| **undetermined** | Unknown state (grey `?`, attribute: `unknown`) |
| **incidentally shaded (ish)** | Shaded but not focal (light manila `#f5e6c8`) |
| **out** | Cell outside any group, transparent background |
| **continue** | Fading gridline extending from content into empty space (attribute: `continue`) |
| **content cell** | Any cell with group membership, state, or label |

---

## nn-diagram Component

**Rendering**: Pure SVG. Cell backgrounds, gridlines, region borders, text, continuation lines all drawn at exact pixel coordinates.

### Attributes

| Attribute | Description |
|-----------|-------------|
| `regions` | Pipe-delimited groups. Each group: space-separated coords (`x,y`) and/or rectangular ranges (`x1,y1:x2,y2`) |
| `shaded` | Space-separated coord list |
| `excluded` | Space-separated coord list |
| `unknown` | Space-separated coord list |
| `ish` | Space-separated coord list (incidentally shaded) |
| `labels` | `coord:text` pairs, e.g. `"2,1:A 3,2:B"` |
| `baseline` | Row number for vertical alignment centering |
| `checkerboard` | Boolean, draws alternating dark/light cell backgrounds |
| `extents` | `x1,y1:x2,y2` to force minimum bounding box |
| `continue` | Which sides extend fading gridlines beyond the grid. Values: `all` (default), `none`, or subset of `top bottom left right` |
| `show-errors` | Boolean, highlights regions without exactly 2 shaded cells |

### CSS Custom Properties

| Property | Default | Description |
|----------|---------|-------------|
| `--nn-cell-size` | 36 | Cell size in pixels |
| `--nn-grid-width` | 1 | Thin gridline width |
| `--nn-region-width` | 3 | Thick region border width |
| `--nn-shaded` | `#f0b429` | Shaded cell color (golden manila) |
| `--nn-ish` | `#f5e6c8` | Incidentally shaded color (light manila) |
| `--nn-excluded` | `#c00` | Excluded ✕ color |
| `--nn-unknown` | `#bbb` | Unknown ? color |
| `--nn-label` | `#444` | Label text color |
| `--nn-grid` | `#999` | Gridline color |
| `--nn-region-border` | `#000` | Region border color |
| `--nn-cell-bg` | `#fff` | Cell background color |
| `--nn-checker` | `#c0c0c0` | Checkerboard dark square color |
| `--nn-caption` | `#666` | Caption text color |
| `--nn-error` | `#e03030` | Error highlight color |

### Key Rendering Details

- Grid size inferred from bounding box of all mentioned cells, +1 padding ring rendered at half-cell size
- Gridlines drawn per-edge; continuation lines fade outward from content cells (4 segments with decreasing opacity)
- Shaded overlays: connected components merged into single `<path>`, drawn with `mix-blend-mode: multiply`
- Region borders: contour-traced as closed paths (no corner overlap), `stroke-linejoin: round`
- Font sizes proportional to cell size: ✕ at 42%, ? at 47%, labels at 36%
- Captions handled by HTML `<figcaption>`, not by the component

---

## nn-sequence Component

Wraps multiple `<nn-diagram>` children in a row with arrow separators and optional captions.

- Auto-syncs `extents` across all child diagrams so they render at same size
- Grid layout: row 1 = diagrams + arrows (arrows vertically centered), row 2 = captions
- Attribute: `captions` — pipe-separated caption list (e.g., `"Before | After"`)
- `<nn-transition>` is a backwards-compatibility alias

### Usage

```html
<nn-sequence captions="Start | Middle | End">
  <nn-diagram regions="..." unknown="..."></nn-diagram>
  <nn-diagram regions="..." shaded="..."></nn-diagram>
  <nn-diagram regions="..." shaded="..." excluded="..."></nn-diagram>
</nn-sequence>
```

---

## Document Structure

### Layout

Two-column grid per lemma/axiom:
- Left column: white card with text (header, prose, corollary)
- Right column: centered diagrams on page background

### Axioms (collapsible `<details>`, collapsed by default, shaded `#eef0f4` background)

| # | Name | Description |
|---|------|-------------|
| A1 | Two-Cell Region | Both cells shaded |
| A2 | Region Saturation | Upper/lower bound on shaded cells per region |
| A3 | Isolated Region | Internal domino forced |

### Lemmas

| # | Name | Key Conclusion |
|---|------|----------------|
| 1 | Elbow | Cell completing 2×2 square around L-tromino is unshaded |
| 2 | Domino Closure | Confirmed domino's 6 neighbors are unshaded |
| 3 | Squeeze | Shaded cell with one free neighbor forces it shaded |
| 4 | No Three Collinear | O?O => OXO |
| 6 | Unique Domino Position | Only one valid pair in region → both shaded |
| 8 | Single External Bridge | Bridge cell must be shaded |
| 9 | Checkerboard Parity | #dark shaded = #light shaded |
| 10 | Mutual Exclusion | Shared edge serves at most one cross-region domino |
| 11 | Snake / Linear Region | Consecutive pairs only; excluding one end forces specific cells |
| 12 | Smothered Cell | All 4 neighbors unshaded → cell unshaded |
| 13 | Brainstem | Layout AAA/ABBB, brainstem cell must be shaded |
| 14 | Peru 🇵🇪 | Two parallel 1×3 regions: centers unshaded, outer columns form dominoes |
| 15 | Two 3-cell Regions, 2 Shared Edges | Layout AAA/.BBB, non-adjacent cells shaded |
| 16 | L-Tromino Corner | Corner's external neighbors unshaded in either orientation |
| 16b | Staircase | L-tromino over straight 3-cell: both regions fully determined |
| 17 | L-Tromino Collinear Block | Cell beyond end unshaded → cell beyond corner also unshaded |
| 18 | L-Tromino Surrounded End | Surrounded end + corner shaded |
| 19 | Compass | Two consecutive cardinal neighbors unshaded → opposite diagonal unshaded |

### Anchors

`#axiom-1` through `#axiom-3`, `#lemma-1` through `#lemma-19` (including `#lemma-16b`), `#summary`

### Summary Table

At bottom of page, anchored at `#summary`. Split into Axioms and Lemmas sections with grey section headers.

### Lemma 9 Diagram

Uses a solved 4×4 puzzle on checkerboard overlay. Regions:
```
A C C B
A A A B
A D B B
D D D D
```
Solution (symmetric): shaded at (2,1)(3,1)(1,2)(4,2)(1,3)(4,3)(2,4)(3,4)

### Complete Puzzle Test Case (in test page)

6×6 solved puzzle with regions:
```
ABBCDD
ABBCCD
AAEEDD
AFFFDG
AFHFGG
AFHFFG
```

---

## Design Decisions

- [DECISION] No rotation variants shown (except Axiom 1)
- [DECISION] SVG rendering instead of CSS tables — precise pixel alignment
- [DECISION] Captions in HTML not component — more flexible
- [DECISION] Region borders as contour-traced paths with rounded joins
- [DECISION] Shaded overlay uses mix-blend-mode: multiply
- [DECISION] Out cells transparent (not grey)
- [DECISION] Half-cell padding ring with fading continuation lines
- [DECISION] nn-sequence auto-syncs extents for matched diagram sizing
- [DECISION] Two-column layout: text card left, diagrams right

---

## Pending / Known Issues

- [ ] Lemma numbering has gaps (5, 7) from axiom promotion — consider renumbering
- [ ] Lemma 10 diagrams are new and may need refinement
- [ ] Lemma 9 could use a second diagram illustrating the parity constraint
- [ ] Lemma 15 may have region overlap issue (cell in two regions)
