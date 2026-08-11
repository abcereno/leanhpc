// src/utils/generateLetterContent.js
//
// Thin wrapper around the generate-letter-content Edge Function, same
// shape as src/utils/validateDocument.js — never throws, always resolves
// to { success, ... }.
//
// NOT currently called by LetterEditorModal.jsx — the client chose to
// rotate through the static, pre-approved wording bank in
// src/data/letterContentBank.js instead of live OpenAI generation ("we
// have a lot of version so its not the same per client"). Left in place
// (Edge Function included) rather than deleted, in case a hybrid/AI mode
// is wanted later — but nothing in the current build depends on it.
export async function generateLetterContent({ bureau, clientName, inquiries }) {
  try {
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-letter-content`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify({ bureau, clientName, inquiries }),
      }
    );
    const result = await res.json();
    if (!result?.success) {
      console.warn("generate-letter-content returned an error:", result?.error);
      return { success: false, error: result?.error || "Letter content generation failed." };
    }
    return result;
  } catch (err) {
    console.warn("generate-letter-content call failed:", err);
    return { success: false, error: err?.message || "Letter content generation failed." };
  }
}
