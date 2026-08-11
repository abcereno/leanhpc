// src/hooks/useDropzone.js
//
// Lightweight drag-and-drop wrapper around the native HTML5 drag events —
// no new dependency. Returns event handlers to spread onto whatever
// element should act as the drop target, plus `isDragActive` so the
// caller can show a highlight while a file is being dragged over it.
//
// Reused by every file-upload area in the client-intake forms (the
// "Additional Documents" pickers on AddClientForm.jsx and
// AddClientModal.jsx, plus CoverLetterAssetsLTOS.jsx's per-category
// tiles) so drag-and-drop behaves identically everywhere instead of each
// spot growing its own slightly-different drag handling.
import { useCallback, useState } from "react";

// `accept` mirrors the HTML <input accept> attribute's mini-syntax
// (".pdf", "image/*", "image/png") so callers can reuse whatever string
// they already pass to their file input, rather than learning a second
// format just for the drop path.
function fileMatchesAccept(file, patterns) {
  if (!patterns.length) return true;
  const type = (file.type || "").toLowerCase();
  const name = (file.name || "").toLowerCase();
  return patterns.some((p) => {
    if (p.startsWith(".")) return name.endsWith(p);
    if (p.endsWith("/*")) return type.startsWith(p.slice(0, -1));
    return type === p;
  });
}

export default function useDropzone({ onFiles, disabled = false, accept } = {}) {
  const [isDragActive, setIsDragActive] = useState(false);
  const patterns = (accept || "")
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);

  const onDragEnter = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      if (e.dataTransfer?.types?.includes("Files")) setIsDragActive(true);
    },
    [disabled]
  );

  const onDragOver = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (disabled) return;
      if (e.dataTransfer) e.dataTransfer.dropEffect = "copy";
    },
    [disabled]
  );

  // Only clears once the pointer actually leaves the drop target itself
  // (not just moving between its child elements) — comparing
  // currentTarget/relatedTarget avoids the classic flicker where
  // entering a child element fires dragleave on the parent.
  const onDragLeave = useCallback((e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.currentTarget.contains(e.relatedTarget)) return;
    setIsDragActive(false);
  }, []);

  const onDrop = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsDragActive(false);
      if (disabled) return;
      const dropped = Array.from(e.dataTransfer?.files || []);
      if (!dropped.length) return;
      const accepted = patterns.length ? dropped.filter((f) => fileMatchesAccept(f, patterns)) : dropped;
      if (accepted.length) onFiles && onFiles(accepted);
      // eslint-disable-next-line react-hooks/exhaustive-deps
    },
    [disabled, onFiles, accept]
  );

  return { isDragActive, dropzoneProps: { onDragEnter, onDragOver, onDragLeave, onDrop } };
}
