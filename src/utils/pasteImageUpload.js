// src/utils/pasteImageUpload.js
//
// Shared clipboard-paste-image-upload helper. CommentsSection.jsx already
// had a one-off version of this (uploads a pasted screenshot to the
// "comment-uploads" storage bucket and turns it into a public URL), but it
// replaces the whole comment text with the URL — fine there since a comment
// IS the screenshot. Notes fields (special_forms_notes, etc.) are longer-
// lived free text that shouldn't get wiped out by a paste, so this version
// hands the uploaded URL back via a callback and lets the caller decide how
// to merge it into the existing text (append on a new line).
//
// Reuses the same "comment-uploads" bucket rather than creating a second
// one — one bucket to manage, and it's already public-read configured.

import { supabase } from "../supabaseClient";

const SCREENSHOT_BUCKET = "comment-uploads";

/**
 * Uploads a single pasted clipboard item if it's an image. Returns the
 * public URL, or null if the item isn't an image. Throws on upload failure
 * so callers can surface the real Supabase error message.
 */
export async function uploadPastedImage(item, prefix = "note-img") {
  if (!item || item.type.indexOf("image") !== 0) return null;
  const blob = item.getAsFile();
  if (!blob) return null;

  const unique = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const fileName = `${prefix}-${unique}.png`;

  const { error } = await supabase.storage
    .from(SCREENSHOT_BUCKET)
    .upload(fileName, blob, { contentType: blob.type || "image/png" });

  if (error) throw error;

  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${SCREENSHOT_BUCKET}/${fileName}`;
}

/**
 * Textarea/input onPaste handler: uploads any image(s) found in the
 * clipboard and calls `onImageUploaded(url)` once per image so the caller
 * can merge it into whatever text state it owns (append, insert at cursor,
 * etc). Non-image pastes (plain text) are ignored — the browser's default
 * paste behavior still runs for those.
 */
export async function handleImagePaste(e, onImageUploaded, onError, prefix = "note-img") {
  const items = e.clipboardData?.items;
  if (!items) return;

  for (const item of items) {
    if (item.type.indexOf("image") !== 0) continue;
    try {
      const url = await uploadPastedImage(item, prefix);
      if (url) onImageUploaded(url);
    } catch (err) {
      onError?.(err);
    }
  }
}
