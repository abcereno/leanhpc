export default function RequiredDocsChecklist({ value, onChange }) {
  const items = [
    { key: "idProvided", label: "Government ID / Driver’s License" },
    { key: "poaProvided", label: "Proof of Address (30–60 days recent)" },
    { key: "ssnProvided", label: "Social Security (card or document)" },
    { key: "monitoringActive", label: "Credit Monitoring Account Active" },
  ];

  const toggle = (k) => onChange({ ...value, [k]: !value[k] });

  return (
    <div className="req-list">
      {items.map((it) => (
        <label
          key={it.key}
          className={`req-item d-flex align-items-center justify-content-between ${value[it.key] ? "is-done" : ""}`}
          style={{
            border: "1px solid var(--tc-border)",
            borderRadius: 12,
            padding: "10px 12px",
            marginBottom: 10,
            background: value[it.key] ? "rgba(30,157,115,0.06)" : "transparent",
          }}
        >
          <span className="me-3" style={{ userSelect: "none" }}>{it.label}</span>
          <input
            type="checkbox"
            checked={!!value[it.key]}
            onChange={() => toggle(it.key)}
            aria-label={it.label}
          />
        </label>
      ))}
    </div>
  );
}
