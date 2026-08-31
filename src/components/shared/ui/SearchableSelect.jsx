import { useState, useMemo, useRef, useEffect } from "react";
import { Form } from "react-bootstrap";

// Generic type-to-filter dropdown for a <select>-style choice out of a long
// option list. Built for the Add Income client picker (1000+ clients made
// a plain <Form.Select> unusable — no way to jump to a name without
// scrolling through every option alphabetically), but takes plain
// { value, label } options so any other long picker in the app (employees,
// companies, etc.) can reuse it instead of growing its own copy.
//
// Renders a hidden <input name=...> alongside the visible search box so it
// drops into existing <Form onSubmit> + FormData(e.target) handlers with
// no changes to the submit logic — same contract as Form.Select had.
export default function SearchableSelect({
  name,
  options,
  placeholder = "Search…",
  required,
  defaultValue = "",
  disabled = false,
}) {
  const [query, setQuery] = useState("");
  const [selectedValue, setSelectedValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef(null);

  const selectedLabel = useMemo(
    () => options.find((o) => o.value === selectedValue)?.label || "",
    [options, selectedValue]
  );

  useEffect(() => {
    function handleClickOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery("");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
    // Cap the rendered list — with 1000+ clients, rendering every match on
    // every keystroke is wasted work once the user has narrowed it down.
    return base.slice(0, 200);
  }, [query, options]);

  const commitSelection = (opt) => {
    setSelectedValue(opt.value);
    setQuery("");
    setOpen(false);
  };

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      <input type="hidden" name={name} value={selectedValue} required={required} readOnly />
      <Form.Control
        type="text"
        placeholder={placeholder}
        value={open ? query : selectedLabel}
        disabled={disabled}
        onFocus={() => {
          setOpen(true);
          setQuery("");
          setHighlight(0);
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setHighlight((h) => Math.min(h + 1, filtered.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setHighlight((h) => Math.max(h - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (filtered[highlight]) commitSelection(filtered[highlight]);
          } else if (e.key === "Escape") {
            setOpen(false);
            setQuery("");
          }
        }}
        autoComplete="off"
      />
      {open && (
        <div
          className="shadow"
          style={{
            position: "absolute",
            zIndex: 1060, // above Bootstrap modal content (1055)
            top: "100%",
            left: 0,
            right: 0,
            marginTop: 4,
            maxHeight: 260,
            overflowY: "auto",
            background: "var(--bg-input, #0F172A)",
            border: "1px solid var(--border-color, #334155)",
            borderRadius: 8,
          }}
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-muted">No matches</div>
          ) : (
            filtered.map((o, i) => (
              <div
                key={o.value}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus so onBlur-driven close doesn't beat the click
                  commitSelection(o);
                }}
                onMouseEnter={() => setHighlight(i)}
                className="px-3 py-2"
                style={{
                  cursor: "pointer",
                  background: i === highlight ? "var(--bg-hover, #1E293B)" : "transparent",
                  color: "var(--text-primary, #F8FAFC)",
                }}
              >
                {o.label}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
