export default function OCRPreview({ text }) {
  if (!text) return null;

  return (
    <div className="mt-4">
      <label className="form-label">🧠 Preview</label>
      <pre className="bg-light border rounded p-3" style={{ maxHeight: "300px", overflow: "auto" }}>
        {text}
      </pre>
    </div>
  );
}