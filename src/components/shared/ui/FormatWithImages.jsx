// src/components/shared/ui/FormatWithImages.jsx
//
// Renders free text with any embedded image URLs (screenshots pasted via
// utils/pasteImageUpload.js, or any other https://.../image.png link)
// shown as actual inline images instead of raw link text — mixed with
// whatever plain text surrounds them.
//
// Extracted from a one-off "FormatNotes" that used to live only inside
// ClientProfile.jsx (for special_forms_notes/logins_notes). Also used by
// CommentsSection.jsx's Activity Thread, which previously only rendered
// an image if the ENTIRE comment text was nothing but the URL — that
// broke as soon as a comment combined typed text with a pasted screenshot
// (e.g. LogChecklistItemModal's auto-generated "✅ FTC marked complete"
// line plus an attached screenshot on the next line).
import React from "react";

const URL_REGEX = /(https?:\/\/[^\s]+)/g;

function isImageUrl(url) {
  return /\.(jpeg|jpg|gif|png|webp)/i.test(url) || url.includes("screenshot");
}

export default function FormatWithImages({ text, lineClassName = "d-block mb-1" }) {
  if (!text) return null;

  return text.split("\n").map((line, index) => {
    const parts = line.split(URL_REGEX);

    return (
      <span key={index} className={lineClassName}>
        {parts.map((part, i) => {
          if (part.match(URL_REGEX)) {
            if (isImageUrl(part)) {
              return (
                <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="d-block mt-2 mb-2 text-center">
                  <img
                    src={part}
                    alt="attachment"
                    className="shadow-sm rounded"
                    style={{ maxWidth: "100%", maxHeight: "350px", border: "2px solid #dee2e6" }}
                  />
                </a>
              );
            }
            return (
              <a key={i} href={part} target="_blank" rel="noopener noreferrer" className="fw-bold">
                {part}
              </a>
            );
          }
          return <span key={i}>{part}</span>;
        })}
      </span>
    );
  });
}
