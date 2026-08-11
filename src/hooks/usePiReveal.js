import { useState, useRef, useEffect } from "react";

const REVEAL_WINDOW_SECS = 30;

export function usePiReveal(canEdit) {
  const [piRevealed, setPiRevealed] = useState(false);
  const [piLeft, setPiLeft] = useState(REVEAL_WINDOW_SECS);
  const timerRef = useRef(null);

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  useEffect(() => stop, []);

  const reveal = () => {
    if (!canEdit) return;
    setPiRevealed(true);
    setPiLeft(REVEAL_WINDOW_SECS);
    stop();
    timerRef.current = setInterval(() => {
      setPiLeft((s) => {
        if (s <= 1) { stop(); setPiRevealed(false); return REVEAL_WINDOW_SECS; }
        return s - 1;
      });
    }, 1000);
  };

  const hide = () => { stop(); setPiRevealed(false); setPiLeft(REVEAL_WINDOW_SECS); };

  return { piRevealed, piLeft, reveal, hide };
}
