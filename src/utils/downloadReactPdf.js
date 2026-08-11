import React from "react";
import { pdf } from "@react-pdf/renderer";
import AuditDoc from "../pdf/AuditDoc"; // <--- FIXED: Added curly braces

export async function downloadReactPdf(input, filename = "document.pdf") {
  let docElement;

  // 1. Check if 'input' is already a valid React Component (like <LPOADoc />)
  if (React.isValidElement(input)) {
    docElement = input;
  } else {
    // 2. Fallback: If 'input' is just data, wrap it in AuditDoc (Legacy support)
    docElement = React.createElement(AuditDoc, { data: input });
    
    if (filename === "document.pdf") {
        filename = "credit-audit.pdf";
    }
  }

  try {
    // Generate Blob
    const blob = await pdf(docElement).toBlob();
    const url = URL.createObjectURL(blob);

    // Trigger Download
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Cleanup
    setTimeout(() => URL.revokeObjectURL(url), 100);
  } catch (error) {
    console.error("PDF Generation Error:", error);
    // Re-throw so callers (which have UI context) can surface a toast/notification.
    // This utility has no UI context of its own, so it should not call alert().
    throw error;
  }
}