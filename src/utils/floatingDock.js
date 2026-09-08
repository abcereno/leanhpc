// src/utils/floatingDock.js
//
// Shared layout constants for AdminLayout's bottom-right stack of floating
// widgets (support chat + the Pipeline (24h) intake queue — see
// FloatingDockContext.jsx for how the two stay coordinated instead of
// overlapping each other).
//
// This used to try to precisely clear AppFooter.jsx's height (first a
// guessed constant, then a measured one via ResizeObserver) — but the
// actual ask was simpler: put the widgets in the literal bottom-right
// corner, the same place every other floating chat widget on the web
// sits, footer or no footer. A small flat offset here does that; the
// FloatingDockContext mutual-exclusion logic is what actually prevents
// the two widgets (or a widget and page content) from blocking each
// other, independent of this number.
export const CORNER_OFFSET = 16; // px from the viewport edge
export const LAUNCHER_SIZE = 60; // px — both widgets' persistent launcher buttons are this size
export const LAUNCHER_GAP = 12; // px between stacked launcher buttons

// The Pipeline queue's launcher stacks directly above the chat launcher's
// own zone.
export const PIPELINE_LAUNCHER_BOTTOM = CORNER_OFFSET + LAUNCHER_SIZE + LAUNCHER_GAP;
