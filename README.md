# Coach Regatta

## Accessibility

The chart uses a colour-blind friendly palette generated with an LCH scale.
Colours are declared as CSS variables in `index.html` and retrieved via
`getColor` from `palette.mjs`. Dataset strokes are 2&nbsp;px wide and maintain a
contrast ratio of at least 4.5:1 against the white background.

## Styling

Z-index values are managed through CSS custom properties to avoid hard-coded numbers spread across the codebase. Variables defined in `index.html` such as `--z-index-controls` and `--z-index-dropdown-active` centralize the stacking order for interactive elements.
