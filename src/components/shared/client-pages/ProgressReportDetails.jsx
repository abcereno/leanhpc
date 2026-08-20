import React from "react";

// Takes the already-computed comparison (see useProgressReportData.js's
// comparisonDetails) instead of raw snapshots + its own compareSnapshots()
// call — this used to redo the exact same comparison the hook already ran,
// on the same two files, every render.
export default function ProgressReportDetails({ comparison, startDate, currentDate }) {
  if (!comparison) return null;

  const data = comparison;

  const bureaus = [
    { code: "TU", name: "TransUnion", color: "#00aaff" },
    { code: "EX", name: "Experian", color: "#ff4444" },
    { code: "EQ", name: "Equifax", color: "#555555" }
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100%' }}>
      {/* Header */}
      <div style={{ borderBottom: "2px solid #333", marginBottom: "30px", paddingBottom: "10px" }}>
        <h2 style={{ margin: 0, textTransform: "uppercase", letterSpacing: "1px", color: "#333", fontSize: "24px" }}>
          Bureau Breakdown
        </h2>
        <p style={{ margin: 0, color: "#666", fontSize: "14px" }}>
          Detailed comparison: {startDate} vs {currentDate}
        </p>
      </div>

      {/* Grid for Bureaus */}
      {/* 👇 FIX: Uses repeat(auto-fit) so it collapses to 1 column on phones, 3 on desktop/PDF */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "15px" }}>
        
        {bureaus.map((bureau) => {
          const bureauData = data[bureau.code];
          
          return (
            <div key={bureau.code} style={{ border: "1px solid #ddd", borderRadius: "4px", overflow: "hidden", backgroundColor: "#fff", display: 'flex', flexDirection: 'column' }}>
              
              {/* Header */}
              <div style={{ backgroundColor: bureau.color, color: "white", padding: "10px", textAlign: "center", fontWeight: "bold" }}>
                {bureau.name}
              </div>

              {/* ✅ DELETED ITEMS */}
              <div style={{ padding: "12px", backgroundColor: "#f0fff4", borderBottom: "1px solid #ddd", flex: 1 }}>
                <h6 style={{ color: "#28a745", margin: "0 0 10px 0", fontSize: "12px", borderBottom: "1px solid #c3e6cb", paddingBottom: "5px" }}>
                  ✅ DELETED
                </h6>
                {bureauData.deleted.length === 0 ? (
                  <p style={{ fontSize: "11px", color: "#999", fontStyle: "italic" }}>No deletions yet.</p>
                ) : (
                  <ul style={{ paddingLeft: "15px", margin: 0, fontSize: "11px" }}>
                    {bureauData.deleted.map((item, i) => (
                      <li key={i} style={{ marginBottom: "5px" }}>
                        <strong style={{ color: "#333" }}>
                          {item.account} {item.account_num ? `(#${item.account_num})` : ''}
                        </strong>
                        <div style={{ fontSize: "9px", color: "#666" }}>{item.issue}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* ⚠️ REMAINING ITEMS */}
              <div style={{ padding: "12px", flex: 1 }}>
                <h6 style={{ color: "#666", margin: "0 0 10px 0", fontSize: "12px", borderBottom: "1px solid #eee", paddingBottom: "5px" }}>
                  ⚠️ REMAINING
                </h6>
                {bureauData.remaining.length === 0 ? (
                  <p style={{ fontSize: "11px", color: "#999", fontStyle: "italic" }}>All clear!</p>
                ) : (
                  <ul style={{ paddingLeft: "15px", margin: 0, fontSize: "11px" }}>
                    {bureauData.remaining.map((item, i) => (
                      <li key={i} style={{ marginBottom: "5px" }}>
                        <strong style={{ color: "#333" }}>
                          {item.account} {item.account_num ? `(#${item.account_num})` : ''}
                        </strong>
                        <div style={{ fontSize: "9px", color: "#666" }}>{item.issue}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* 🛑 ADDED ITEMS */}
              {bureauData.added.length > 0 && (
                <div style={{ padding: "12px", backgroundColor: "#fff5f5", borderTop: "1px solid #ddd" }}>
                  <h6 style={{ color: "#dc3545", margin: "0 0 10px 0", fontSize: "12px" }}>
                    🛑 NEW
                  </h6>
                  <ul style={{ paddingLeft: "15px", margin: 0, fontSize: "11px" }}>
                    {bureauData.added.map((item, i) => (
                      <li key={i} style={{ marginBottom: "5px" }}>
                        <strong style={{ color: "#dc3545" }}>
                          {item.account} {item.account_num ? `(#${item.account_num})` : ''}
                        </strong>
                        <div style={{ fontSize: "9px", color: "#666" }}>{item.issue}</div>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

            </div>
          );
        })}
      </div>

      {/* 👇 FIX: Removed absolute positioning. Now sits at the bottom of the content naturally. */}
      <div style={{ marginTop: "30px", width: "100%", textAlign: "center", color: "#999", fontSize: "10px", borderTop: "1px solid #eee", paddingTop: "10px" }}>
        * "Deleted" includes accounts removed or updated to Positive/Paid status.
      </div>
    </div>
  );
}