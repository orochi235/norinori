# `<nn-diagram>` Web Component

A custom element for rendering Norinori puzzle diagrams as SVG.

## Coordinate System

- Origin is at the **top-left corner** of the grid.
- Numbering starts at **1**.
- Coordinates are written as **x,y** (column, row), where x increases left→right and y increases top→down.
- Example: in a 3×3 grid, the center cell is `2,2`.

## Terminology

| Term | Meaning |
|------|---------|
| **domino** | A pair of orthogonally adjacent shaded cells. |
| **group** | A set of cells bounded by thick borders, representing a Norinori region. Called "group" in working language, maps to `regions` in the attribute syntax. |
| **shaded** | A cell that is filled in (purple). Part of a domino. |
| **excluded** | A cell known to be unshaded. Rendered with a red ✕. |
| **undetermined** | A cell whose state is not yet known. Rendered with a grey `?`. Maps to the `unknown` attribute. |
| **incidentally shaded** | A cell that is shaded in a valid solution but isn't the focus of the current lemma. Lighter purple. Maps to the `ish` attribute. |
| **out** | A cell outside any group and without any state. Transparent background, no symbol. The default for any cell not mentioned in attributes. |
| **stub** | Short fading gridline segment that extends outward from content cells into empty space, implying the grid continues beyond what is shown. |
| **content cell** | Any cell that is part of a group, has a state, or has a label. Gridlines are drawn around content cells. |

## Pattern Shorthand

When describing diagram patterns in conversation, we use the following shorthand:

| Symbol | Meaning |
|--------|---------|
| `O` | Shaded cell |
| `X` | Excluded (unshaded) cell |
| `?` or `_` | Undetermined cell |

Patterns are written as strings (e.g., `O?O => OXO` means "two shaded cells with an unknown between them becomes two shaded cells with an excluded cell between them"). Multi-row patterns use `/` as a row separator.

## Diagram Numbering

Diagrams are referenced as **L.D** where L is the lemma number and D is the diagram number within that lemma (e.g., diagram 3.2 is the second diagram in Lemma 3).

## Attributes

### `regions`

Defines one or more groups. Groups are separated by `|`. Each group is a space-separated list of cell coordinates or rectangular ranges.

**Individual cells:**
```
regions="1,1 2,1 2,2"
```

**Rectangular ranges** (corner-to-corner, inclusive):
```
regions="1,1:3,2"
```
This expands to all 6 cells in the 3×2 rectangle from (1,1) to (3,2).

**Multiple groups:**
```
regions="1,1 2,1 2,2 | 3,1 3,2 4,2"
```

**Mixed notation:**
```
regions="1,1:2,3 3,1 | 4,1:5,2"
```

Thick borders are computed automatically from group adjacency. An edge gets a thick border when the cell on one side belongs to a different group (or no group) than the cell on the other side.

### `shaded`

Space-separated coordinates of shaded cells.
```
shaded="1,1 2,1"
```

### `excluded`

Space-separated coordinates of excluded (✕) cells.
```
excluded="3,1 3,2"
```

### `unknown`

Space-separated coordinates of undetermined (?) cells.
```
unknown="2,2 3,2"
```

### `ish`

Space-separated coordinates of incidentally shaded cells.
```
ish="1,2 2,2"
```

### `labels`

Space-separated `coord:text` pairs. Labels replace the default symbol for that cell's state. If a cell is shaded and labeled, the label appears in white on the purple background.
```
labels="1,1:A 2,1:B 2,2:C"
```

### `caption`

Text displayed below the diagram.
```
caption="L-tromino with corner labeled"
```

## Grid Size and Padding

The grid size is **inferred** from the bounding box of all mentioned cells (across all attributes). One row/column of out cells is added on each side as padding.

## Rendering

- **Cell backgrounds**: white for group cells without a state, purple for shaded, light purple for incidentally shaded, transparent for out cells.
- **Gridlines**: 1px `#ccc` lines drawn between content cells.
- **Stubs**: where a content cell borders an out cell, short fading gridline segments extend outward into the empty space.
- **Group borders**: 3px solid black, drawn on edges where adjacent cells belong to different groups.
- **Text**: ✕ for excluded (red), ? for undetermined (grey italic), labels in dark grey (or white on shaded backgrounds). Shaded cells without labels show no visible text.

## Examples

### Basic two-cell group
```html
<nn-diagram
  regions="1,1 2,1"
  shaded="1,1 2,1"
  caption="Both shaded">
</nn-diagram>
```

### Region-agnostic diagram (no group borders)
```html
<nn-diagram
  shaded="2,2"
  excluded="2,1 1,2 2,3"
  unknown="3,2"
  caption="Forced partner">
</nn-diagram>
```

### L-tromino with labels
```html
<nn-diagram
  regions="2,1 1,2 2,2"
  labels="2,1:D 1,2:C 2,2:E"
  caption="L-tromino region (D–C–E)">
</nn-diagram>
```

### Two interacting groups
```html
<nn-diagram
  regions="1,1 2,1 2,2 | 3,1 3,2 4,2"
  shaded="1,1 4,2"
  caption="Non-adjacent cells must be shaded">
</nn-diagram>
```

### Rectangular range
```html
<nn-diagram
  regions="1,1:3,2"
  shaded="1,1"
  excluded="3,1 3,2"
  unknown="2,1 1,2 2,2"
  caption="3×2 region with partial solve">
</nn-diagram>
```

## Rotation Variants

With the exception of Lemma 1, rotation variants (90° rotations of the same pattern) are not shown. One orientation is sufficient; the reader can infer the rest.
