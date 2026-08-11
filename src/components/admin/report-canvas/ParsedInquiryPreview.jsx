export default function ParsedInquiryPreview({ inquiries, onSave }) {
  const hasData = Object.values(inquiries).some(arr => Array.isArray(arr) && arr.length > 0);
  if (!hasData) return null;

  return (
    <div className="mt-4">
      <label className="form-label">Preview: Parsed Inquiries</label>
      <pre className="bg-light border rounded p-3" style={{ maxHeight: "300px", overflow: "auto" }}>
        {JSON.stringify(inquiries, null, 2)}
      </pre>
      <button className="btn btn-success mt-3" onClick={onSave}>
        ✅ Confirm & Save
      </button>
    </div>
  );
}