// src/context/FloatingDockContext.jsx
//
// Coordinates the admin shell's bottom-right floating widgets — the
// support chat (SupportChatPopups.jsx) and the "Pipeline (24h)" intake
// queue (ClientSubmissionListener.jsx) — so they never fight over the
// same corner again.
//
// What happened before this existed: both widgets independently used
// `position: fixed` anchored to roughly the same spot with the same
// z-index, each guessing its own offset with no idea the other existed.
// Opening one could visually bury the other's card underneath it, with no
// way to click through to whatever was hidden — literally two of the
// app's own widgets blocking each other, not page content.
//
// The fix is a single shared "which panel is expanded" slot. Both
// widgets keep their own persistent launcher button always visible
// (stacked in one column — see src/utils/floatingDock.js for the shared
// offsets), but only one's full panel/card can be open at a time —
// claiming the dock auto-collapses whichever other panel was open, so an
// expanded panel can never have anything hidden behind it.
import { createContext, useCallback, useContext, useMemo, useState } from "react";

const FloatingDockContext = createContext(null);

export function FloatingDockProvider({ children }) {
  // null | 'chat' | 'pipeline' — whichever widget currently owns the
  // expanded panel. Only one at a time, by construction: opening one just
  // overwrites this, there's no "close, then check if anyone else wants
  // it" negotiation needed.
  const [activePanel, setActivePanel] = useState(null);

  const openPanel = useCallback((id) => setActivePanel(id), []);
  // Only clears if this caller is actually the one holding it — so a
  // stale "collapse" call from a widget that already lost the dock to
  // someone else can't accidentally close the new owner's panel.
  const closePanel = useCallback((id) => setActivePanel((prev) => (prev === id ? null : prev)), []);

  const value = useMemo(() => ({ activePanel, openPanel, closePanel }), [activePanel, openPanel, closePanel]);

  return <FloatingDockContext.Provider value={value}>{children}</FloatingDockContext.Provider>;
}

export function useFloatingDock() {
  const ctx = useContext(FloatingDockContext);
  if (!ctx) throw new Error("useFloatingDock must be used within a FloatingDockProvider");
  return ctx;
}
