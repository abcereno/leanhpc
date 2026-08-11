import { useEffect, useState } from "react";
import { supabase } from "../../../supabaseClient";
import { useToast } from "../../shared/ui/ToastNotifier";
import { handleImagePaste } from "../../../utils/pasteImageUpload";
import FormatWithImages from "../../shared/ui/FormatWithImages";

// 👇 Added refreshKey to props 👇
// `onCommentPosted` (optional) fires right after a successful insert —
// lets a caller like RemindersSidebar.jsx react to "a comment actually
// went out" (e.g. refresh its own "Did comment on the activity thread?"
// checklist signal) without this component needing to know that exists.
export default function CommentsSection({ clientId, readonly = false, refreshKey, onCommentPosted }) {
  const { addToast } = useToast();
  const [thread, setThread] = useState([]);
  const [newComment, setNewComment] = useState("");
  const [adminName, setAdminName] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [clientReady, setClientReady] = useState(false);

  useEffect(() => {
    if (!clientId) return;

    fetchThread();
    fetchAdmin();

    const channel = supabase
      .channel(`comments-thread-${clientId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "comments",
          filter: `client_id=eq.${clientId}`,
        },
        (payload) => {
          setThread((prev) => [...prev, payload.new]);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  // 👇 Added refreshKey to dependency array 👇
  }, [clientId, refreshKey]);

  useEffect(() => {
    const checkClientReadiness = async () => {
      if (!clientId) return;

      const { data: client, error: clientErr } = await supabase
        .from("clients")
        .select("ssn, dob, address, company_id, admin_id")
        .eq("id", clientId)
        .single();

      const { data: docs, error: docErr } = await supabase
        .from("client_documents")
        .select("id")
        .eq("client_id", clientId);

      const hasInfo =
        client &&
        client.ssn?.trim() &&
        client.dob?.trim() &&
        client.address?.trim() &&
        client.company_id &&
        client.admin_id;

      const hasDocs = Array.isArray(docs) && docs.length > 0;
      
      if (clientErr || docErr) {
          console.log(clientErr, docErr);
      }
      
      setClientReady(hasInfo && hasDocs);
    };

    checkClientReadiness();
  // 👇 Added refreshKey to dependency array 👇
  }, [clientId, refreshKey]);

  const fetchThread = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("comments")
      .select("*")
      .eq("client_id", clientId)
      .order("timestamp", { ascending: true });

    if (!error) {
      const formatted = (data || []).map((c) => ({
        ...c,
        formattedDate: c.timestamp
          ? new Intl.DateTimeFormat("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            }).format(new Date(c.timestamp))
          : "Unknown",
      }));
      setThread(formatted);
    }
    setLoading(false);
  };

  const fetchAdmin = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .single();
      setAdminName(data?.full_name || "Admin");
    }
  };

  const handleAddComment = async () => {
    if (!newComment.trim()) return;

    setSubmitting(true);
    const { error } = await supabase.from("comments").insert([
      {
        client_id: clientId,
        text: newComment.trim(),
        author: adminName,
      },
    ]);
    setSubmitting(false);

    if (!error) {
      setNewComment("");
      await fetchThread();
      addToast({ title: "Comment Added", message: "Posted to the Activity Thread.", variant: "success", icon: "bi-chat-left-text-fill" });
      onCommentPosted?.();
    } else {
      addToast({ title: "Comment Failed", message: error.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    }
  };

  // Shared with EditClientModal.jsx's special-notes paste handler and
  // LogChecklistItemModal.jsx — appends the uploaded screenshot's URL on a
  // new line instead of replacing whatever the admin already typed, so
  // "type a note, then paste a screenshot" doesn't silently wipe the note
  // (the old inline version here did exactly that: setNewComment(url)).
  const handlePaste = (e) => {
    handleImagePaste(
      e,
      (url) => setNewComment((prev) => (prev ? `${prev}\n${url}` : url)),
      (err) => addToast({ title: "Image Upload Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" }),
      "comment-img"
    );
  };

  return (
    <div className="card shadow-sm">
      <div className="card-header">
        <h5 className="mb-0">
          <i className="bi bi-chat-left-text me-2"></i>
          Activity Thread
        </h5>
      </div>

      <div className="card-body p-0">
        {loading ? (
          <div className="p-3">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="mb-3">
                <div className="placeholder-glow mb-1">
                  <span className="placeholder col-4"></span>
                </div>
                <div className="placeholder-glow">
                  <span className="placeholder col-8 mb-1"></span>
                  <span className="placeholder col-6"></span>
                </div>
              </div>
            ))}
          </div>
        ) : thread.length === 0 ? (
          <div className="text-center py-4">
            <i className="bi bi-chat-left-text fs-1 text-muted"></i>
            <p className="mt-2">No comments yet</p>
          </div>
        ) : (
          <div
            className="table-responsive p-3"
            style={{ maxHeight: "350px", overflowY: "auto" }}
          >
            <table className="table table-sm table-borderless">
              <tbody>
                {thread.map((comment, i) => (
                  <tr key={comment.id || i}>
                    <td>
                      <strong>{comment.author || "Unknown"}</strong>{" "}
                      <small className="text-muted">
                        ({comment.formattedDate})
                      </small>
                      <div className="mt-1">
                        <FormatWithImages text={comment.text} lineClassName="d-block" />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!readonly && (
        <div className="card-footer">
            <div className="mb-3">
            <label className="form-label">
              Add Comment or Paste Screenshot
            </label>
            {/\.(jpeg|jpg|gif|png|webp)/i.test(newComment) && (
              <div className="mb-2 border rounded p-2 bg-light">
                <FormatWithImages text={newComment} lineClassName="d-block" />
              </div>
            )}
            <textarea
              className="form-control mb-2"
              rows="3"
              value={newComment}
              onChange={(e) => setNewComment(e.target.value)}
              onPaste={handlePaste}
              placeholder="Write your comment here or paste screenshot..."
              disabled={readonly}
            />
            <button
              className="btn btn-success w-100 mb-2"
              onClick={handleAddComment}
              disabled={readonly || submitting || !clientReady}
            >
              {submitting ? (
                <span
                  className="spinner-border spinner-border-sm me-2"
                  role="status"
                />
              ) : (
                <i className="bi bi-send me-2"></i>
              )}
              Post Comment
            </button>
          </div>
        </div>
      )}
    </div>
  );
}