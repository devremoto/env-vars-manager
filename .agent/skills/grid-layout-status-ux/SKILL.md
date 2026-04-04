---
name: Grid Layout & Visual Status UX
description: Guidelines for building stable, information-dense grids with visual status signaling
---

# Grid Layout & Visual Status UX

To ensure a professional and stable user experience in data-rich environment variable grids, follow these architectural and styling patterns.

## 1. Column Stabilization
- **Fixed Widths**: Enforce strict `min-width` or `fixed` widths on the first "Checkbox" column (currently `48px`). This prevents horizontal "dancing" headers when expanding nested rows or groups.
- **Alignment**: Use `text-align: center` on the parent cell (`td.td-check`, `th.cell-check`) for consistent vertical and horizontal centering of inputs.

## 2. Visual Status Signaling (Traffic Light Pattern)
All rows in the grid must communicate their security status (Protection) using a vertical left-accent stripe.

### Status Indicators
- **🟢 Protected** (Secure): `#4CAF50`.
- **🟠 Partial** (Mixed Groups): `var(--warning)`.
- **⚪ Unprotected** (Neutral): `var(--text-secondary)` (Opacity `0.5`).

### Implementation (Absolute Stripe Position)
Use a pseudo-element on the first column cell to avoid adding to the cell's actual width:
```css
.row-protected .td-check::before,
.row-partial-protected .td-check::before,
.row-unprotected .td-check::before {
  content: '';
  position: absolute;
  left: 0; top: 0; bottom: 0;
  width: 3.5px;
  pointer-events: none;
}
```

## 3. Custom Checkbox Engineering
When using custom-styled checkboxes (`appearance: none`):
- **Avoid display overrides**: Do not apply `display: inline-block !important` directly to the input to center it. This can block the `display: inline-grid` required for the checkmark `::before` to render.
- **Center via Parent**: Center the checkbox using the cell's `text-align: center` and use `margin: 0 auto` for the checkbox itself.

## 4. Information Density
- **Padding Control**: For utility tools, prioritize density. In the `env-vars-manager`, horizontal padding is kept to `10px` but vertical padding is minimized to `6px` for a compact, readable list.
- **Hover States**: Apply subtle hover backgrounds (`var(--bg-hover)`) on `.var-row` to help users track rows horizontally in density-optimized views.
