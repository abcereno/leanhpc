import React from "react";
import ReactDOM from "react-dom";

export default function PdfPreviewModal({ open, onClose, onDownload, children }) {
  if (!open) return null;
  
  return ReactDOM.createPortal(
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.7)", // Dark overlay to draw focus to the modal
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: "95%",
          maxWidth: 900,
          maxHeight: "90vh",
          background: "#ffffff",
          borderRadius: 12,
          boxShadow: "0 10px 40px rgba(0,0,0,0.3)",
          display: "grid",
          gridTemplateRows: "auto 1fr auto",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <header style={{ padding: "16px 20px", borderBottom: "1px solid #e2e8f0", backgroundColor: "#f8fafc" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: "700", color: "#1e293b" }}>Report PDF Preview</h3>
            <button
              onClick={onClose}
              style={{ border: "none", background: "transparent", fontSize: 24, lineHeight: 1, cursor: "pointer", color: "#64748b" }}
            >
              ×
            </button>
          </div>
        </header>

        {/* Modal Content (Document Viewer Area) */}
        {/* 👇 FIX: Changed to a classic PDF Viewer Gray so the pure white PDF pops! 👇 */}
        <div style={{ overflow: "auto", padding: "32px 24px", background: "#525659" }}>
          {children}
        </div>

        {/* Modal Footer */}
        <footer style={{ padding: "16px 20px", borderTop: "1px solid #e2e8f0", display: "flex", gap: 12, justifyContent: "center", backgroundColor: "#f8fafc" }}>
          <button className="btn btn-outline-secondary fw-bold px-4" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary fw-bold px-4" onClick={onDownload}>
             Download PDF
          </button>
        </footer>
      </div>
    </div>,
    document.body
  );
}