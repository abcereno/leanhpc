import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { supabase } from "../../supabaseClient";
import { Button, Modal, Form, Alert, Spinner } from "react-bootstrap";
import AlertBell from "./AlertBell";

export default function AdminNavbar({ isSidebarOpen, setIsSidebarOpen }) {
  const { user, signOut, isDeveloper, userId, hasPermission } = useAuth();
  const navigate = useNavigate();

  // --- ADMIN NAME LOGIC ---
  const [adminName, setAdminName] = useState("");

  useEffect(() => {
    let cancelled = false;
    const loadName = async () => {
      if (!user?.id) return;
      const { data, error } = await supabase
        .from("profiles")
        .select("full_name")
        .eq("id", user.id)
        .maybeSingle();
      if (!cancelled) setAdminName(error ? "" : (data?.full_name || ""));
    };
    loadName();
    return () => { cancelled = true; };
  }, [user?.id]);

  const handleLogout = async () => {
    await signOut();
    navigate('/login', { replace: true });
  };

  // ─────────────────────────────────────────────────────────────
  // THREADS LOGIC
  // ─────────────────────────────────────────────────────────────
  const [showThreads, setShowThreads] = useState(false);
  const [threadClients, setThreadClients] = useState([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [threadsLoading, setThreadsLoading] = useState(false);
  const [feed, setFeed] = useState([]);
  const [selectedThreadClient, setSelectedThreadClient] = useState("");
  const [postText, setPostText] = useState("");
  const [replyDrafts, setReplyDrafts] = useState({});
  const [flash, setFlash] = useState("");
  
  // New Filters
  const [stateFilter, setStateFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  const openThreads = async () => {
    setShowThreads(true);
    setFlash("");
    await loadThreadClients();
  };

  const closeThreads = () => {
    setShowThreads(false);
    setSelectedThreadClient("");
    setPostText("");
    setReplyDrafts({});
    setFeed([]);
    setFlash("");
    setStateFilter("");
    setDateFilter("");
  };

async function loadThreadClients() {
    setClientsLoading(true);
    const PAGE = 1000;
    let page = 0;
    const all = [];
    try {
      const canSeeAll = hasPermission("view_all_clients");
      while (true) {
        // 👇 Reverted back to just id and full_name so it doesn't crash!
        let q = supabase
          .from("clients")
          .select("id, full_name")
          .order("full_name", { ascending: true })
          .range(page * PAGE, page * PAGE + PAGE - 1);

        if (!canSeeAll && user?.id) q = q.eq("admin_id", user.id);

        const { data, error } = await q;
        if (error) throw error;

        const rows = data || [];
        all.push(...rows);

        if (rows.length < PAGE) break;
        page += 1;
      }

      const byId = new Map();
      for (const c of all) byId.set(c.id, c);
      const collator = new Intl.Collator("en", { sensitivity: "base" });
      const sorted = Array.from(byId.values()).sort((a, b) => collator.compare(a.full_name || "", b.full_name || ""));
      setThreadClients(sorted);
    } catch (e) {
      console.error("loadThreadClients error:", e);
    } finally {
      setClientsLoading(false);
    }
  }

  function buildFeed(rows) {
    const byId = {};
    rows.forEach(r => { byId[r.id] = { ...r, replies: [] }; });
    const roots = [];
    rows.forEach(r => {
      if (r.parent_id) {
        if (byId[r.parent_id]) byId[r.parent_id].replies.push(byId[r.id]);
      } else {
        roots.push(byId[r.id]);
      }
    });
    roots.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
    roots.forEach(p => p.replies.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp)));
    return roots;
  }

  async function loadFeed(clientId) {
    if (!clientId) return;
    try {
      setThreadsLoading(true);
      const { data, error } = await supabase
        .from("comments")
        .select("id, client_id, text, author, parent_id, timestamp")
        .eq("client_id", clientId)
        .order("timestamp", { ascending: true });
      if (error) throw error;
      setFeed(buildFeed(data || []));
    } catch (e) {
      console.error(e);
    } finally {
      setThreadsLoading(false);
    }
  }

  useEffect(() => {
    if (!showThreads || !selectedThreadClient) return;
    const channel = supabase
      .channel(`comments-${selectedThreadClient}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comments", filter: `client_id=eq.${selectedThreadClient}` }, () => loadFeed(selectedThreadClient))
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [showThreads, selectedThreadClient]);

  useEffect(() => {
    if (selectedThreadClient) loadFeed(selectedThreadClient);
  }, [selectedThreadClient]);

  async function submitPost() {
    setFlash("");
    const text = postText.trim();
    if (!selectedThreadClient) return setFlash("Pick a client first.");
    if (!text) return setFlash("Write something first.");
    try {
      const row = {
        id: crypto.randomUUID(),
        client_id: selectedThreadClient,
        text,
        author: adminName || user?.email || "Anonymous",
        parent_id: null,
        timestamp: new Date().toISOString(),
      };
      const { error } = await supabase.from("comments").insert([row]);
      if (error) throw error;
      setPostText("");
    } catch (e) {
      setFlash(`❌ ${e.message || e}`);
    } finally {
      setTimeout(() => setFlash(""), 3000);
    }
  }

  async function submitReply(parentId) {
    setFlash("");
    const text = (replyDrafts[parentId] || "").trim();
    if (!text) return;
    try {
      const row = {
        id: crypto.randomUUID(),
        client_id: selectedThreadClient,
        text,
        author: adminName || user?.email || "Anonymous",
        parent_id: parentId,
        timestamp: new Date().toISOString(),
      };
      const { error } = await supabase.from("comments").insert([row]);
      if (error) throw error;
      setReplyDrafts(prev => ({ ...prev, [parentId]: "" }));
    } catch (e) {
      setFlash(`❌ ${e.message || e}`);
    } finally {
      setTimeout(() => setFlash(""), 3000);
    }
  }

  function relTime(iso) {
    if (!iso) return "";
    const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
    if (s < 60) return `${s}s`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h`;
    const d = Math.floor(h / 24);
    return `${d}d`;
  }

  // --- FILTER HELPERS ---
  const uniqueStates = [...new Set(threadClients.map(c => c.state).filter(Boolean))].sort();
  const filteredClients = threadClients.filter(c => !stateFilter || c.state === stateFilter);
  
  // Filter feed by date (Checks if the root post OR any of its replies match the selected date)
  const filteredFeed = feed.filter(post => {
    if (!dateFilter) return true;
    const postDate = post.timestamp?.substring(0, 10);
    if (postDate === dateFilter) return true;
    
    // Also include the parent post if any replies happened on this date
    const hasMatchingReply = post.replies?.some(r => r.timestamp?.substring(0, 10) === dateFilter);
    return hasMatchingReply;
  });

  return (
    <>
      <header className="bg-white border-bottom shadow-sm px-4 d-flex align-items-center justify-content-between flex-shrink-0" style={{ height: '70px', zIndex: 1030 }}>
        <div className="d-flex align-items-center">
          <Button variant="light" className="me-3 d-md-none border" onClick={() => setIsSidebarOpen(!isSidebarOpen)}>
            <i className="bi bi-list fs-4"></i>
          </Button>
        </div>

        {/* HEADER RIGHT SIDE (Alerts, Threads, Profile) */}
        <div className="d-flex align-items-center gap-3">
          {!isDeveloper && (
            <>
              <AlertBell />
              <Button variant="outline-primary" size="sm" className="fw-bold px-3 shadow-sm" onClick={openThreads}>
                <i className="bi bi-chat-dots me-2"></i>Threads
              </Button>
            </>
          )}

          <div className="d-flex align-items-center border-start ps-3 ms-2">
            <Link to={`/admin/${userId}`} className="d-flex align-items-center text-decoration-none">
              <span className="text-muted small d-none d-lg-block me-3 text-end lh-1">
                <span className="d-block mb-1">Welcome,</span>
                <strong className="text-dark">{adminName || user?.email?.split('@')[0] || "Admin"}</strong>
              </span>
              <div className="bg-primary text-white rounded-circle d-flex align-items-center justify-content-center fw-bold shadow-sm" style={{ width: '40px', height: '40px', fontSize: '1.2rem' }}>
                {adminName?.charAt(0).toUpperCase() || "A"}
              </div>
            </Link>

            <Button variant="link" className="text-danger ms-3 p-0" onClick={handleLogout} title="Sign Out">
              <i className="bi bi-box-arrow-right fs-4"></i>
            </Button>
          </div>
        </div>
      </header>

      {/* THREADS MODAL */}
      <Modal show={showThreads} onHide={closeThreads} centered size="lg">
        <Modal.Header closeButton className="bg-dark text-white border-secondary">
          <Modal.Title className="text-primary"><i className="bi bi-chat-dots me-2"></i>Client Threads</Modal.Title>
        </Modal.Header>
        <Modal.Body className="bg-dark text-white">
          {flash && <Alert variant={flash.startsWith("❌") ? "danger" : "info"} className="py-2">{flash}</Alert>}
          
          <div className="row g-3 mb-3">
            {/* STATE FILTER */}
            <div className="col-md-4">
              <Form.Label className="text-muted small text-uppercase fw-bold">Filter by State</Form.Label>
              <Form.Select 
                className="bg-secondary text-white border-0" 
                value={stateFilter} 
                onChange={(e) => { 
                    setStateFilter(e.target.value); 
                    setSelectedThreadClient(""); // Reset selected client when switching states
                }}
              >
                <option value="">All States</option>
                {uniqueStates.map(s => <option key={s} value={s}>{s}</option>)}
              </Form.Select>
            </div>

            {/* CLIENT SELECTOR */}
            <div className="col-md-8">
              <Form.Label className="text-muted small text-uppercase fw-bold">Select Client</Form.Label>
              <Form.Select 
                className="bg-secondary text-white border-0" 
                value={selectedThreadClient} 
                onChange={(e) => setSelectedThreadClient(e.target.value)} 
                disabled={clientsLoading}
              >
                <option value="">{clientsLoading ? "Loading…" : "Select client…"}</option>
                {filteredClients.map(c => (
                    <option key={c.id} value={c.id}>
                        {c.full_name} {c.state ? `(${c.state})` : ""}
                    </option>
                ))}
              </Form.Select>
              {clientsLoading && <div className="small text-muted mt-1"><Spinner size="sm" /> Loading clients…</div>}
            </div>
          </div>

          <Form className="mb-4">
            <Form.Control as="textarea" rows={3} placeholder="What's on your mind?" value={postText} onChange={(e) => setPostText(e.target.value)} disabled={!selectedThreadClient} className="bg-secondary text-white border-0" />
            <div className="d-flex justify-content-end mt-2">
              <Button onClick={submitPost} disabled={!selectedThreadClient || !postText.trim()} variant="primary" className="fw-bold px-4">Post</Button>
            </div>
          </Form>

          {threadsLoading ? (
            <div className="text-center py-4"><Spinner animation="border" variant="primary" /></div>
          ) : !selectedThreadClient ? (
            <div className="text-center text-muted py-5 border rounded border-secondary border-opacity-25">
               <i className="bi bi-arrow-up-circle fs-1 d-block mb-3 opacity-50"></i>
               <h5 className="mb-0">Pick a client above to view their thread.</h5>
            </div>
          ) : (
            <>
                {/* DATE FILTER HEADER */}
                <div className="d-flex justify-content-between align-items-end mb-3 pb-2 border-bottom border-secondary border-opacity-50">
                    <h6 className="text-primary fw-bold mb-0"><i className="bi bi-clock-history me-2"></i>Thread History</h6>
                    <div className="d-flex align-items-center gap-2">
                        <Form.Label className="text-muted small mb-0 fw-bold">Date:</Form.Label>
                        <Form.Control
                            type="date"
                            size="sm"
                            className="bg-secondary text-white border-0"
                            value={dateFilter}
                            onChange={(e) => setDateFilter(e.target.value)}
                            style={{ width: '130px' }}
                        />
                        {dateFilter && (
                            <Button size="sm" variant="outline-secondary" onClick={() => setDateFilter("")} title="Clear Date Filter">
                                <i className="bi bi-x"></i>
                            </Button>
                        )}
                    </div>
                </div>

                {filteredFeed.length === 0 ? (
                    <Alert variant="info" className="bg-opacity-10 border-info text-info text-center py-4">
                        <i className="bi bi-chat-square-text fs-2 d-block mb-2"></i>
                        {dateFilter ? "No posts found for this specific date." : "No posts yet. Be the first to start the conversation!"}
                    </Alert>
                ) : (
                    <div className="vstack gap-3">
                    {filteredFeed.map(post => (
                        <div key={post.id} className="p-3 rounded bg-secondary bg-opacity-10 border border-secondary border-opacity-25">
                        <div className="d-flex justify-content-between align-items-center mb-2">
                            <strong className="text-primary">{post.author || "Unknown"}</strong>
                            <small className="text-muted" style={{ fontSize: '0.75rem' }}>
                                {new Date(post.timestamp).toLocaleDateString()} • {relTime(post.timestamp)}
                            </small>
                        </div>
                        <div className="text-white mb-3" style={{ whiteSpace: "pre-wrap" }}>{post.text}</div>
                        <div className="mt-3 ps-3 border-start border-secondary">
                            {post.replies.map(r => (
                            <div key={r.id} className="mb-2">
                                <div className="d-flex justify-content-between align-items-center">
                                <strong className="text-info small">{r.author || "Unknown"}</strong>
                                <small className="text-muted" style={{ fontSize: '0.7rem' }}>
                                    {new Date(r.timestamp).toLocaleDateString()} • {relTime(r.timestamp)}
                                </small>
                                </div>
                                <div className="text-light small opacity-75" style={{ whiteSpace: "pre-wrap" }}>{r.text}</div>
                            </div>
                            ))}
                            <div className="d-flex gap-2 mt-3">
                            <Form.Control size="sm" placeholder="Write a reply…" value={replyDrafts[post.id] || ""} onChange={(e) => setReplyDrafts(prev => ({ ...prev, [post.id]: e.target.value }))} className="bg-dark text-white border-secondary" />
                            <Button size="sm" variant="outline-light" onClick={() => submitReply(post.id)} disabled={!(replyDrafts[post.id] || "").trim()}>Reply</Button>
                            </div>
                        </div>
                        </div>
                    ))}
                    </div>
                )}
            </>
          )}
        </Modal.Body>
        <Modal.Footer className="bg-dark text-white border-top border-secondary">
          <Button variant="outline-light" onClick={closeThreads}>Close</Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}