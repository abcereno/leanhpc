import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../context/AuthContext";
import { Button, Badge, Card, ListGroup, Spinner } from "react-bootstrap";
import useLogger from "../../hooks/useLogger";
// 👇 NEW: Import the useToast hook directly 👇
import { useToast } from "../shared/ui/ToastNotifier";
import { isBlankStartInquiries } from "../../utils/inquiryCounts";
import { formatDurationBetween } from "../../utils/formatDuration";

const QUEUE_WINDOW_MS = 24 * 60 * 60 * 1000;

// A client's intake counting step is "done" once ANY of these are true.
// counter/processing_duration are only ever set by useInquiriesThread.js's
// full thread editor save — UploadReportForm.jsx and SmartIdiQModal.jsx
// (the two "quick count" paths) never set processing_duration, and counter
// silently stayed null for a while on both due to the adminName bug fixed
// elsewhere this session. start_inquiries is the one signal every save path
// reliably sets once real counting has happened, so it's included here too
// — otherwise a client counted through a quick-count path before that fix
// shows real TU/EXP/EQ numbers everywhere else in the app but still shows
// as unclaimed/"TAKEN" in this queue forever.
const deriveIsCompleted = (row) =>
  row.counter !== null || !!row.processing_duration || !isBlankStartInquiries(row.start_inquiries);

// processing_duration is the real, measured "editor was open this long"
// time — use it whenever it's there. Otherwise prefer counted_at, which is
// frozen the first time ANY save path actually saves the inquiries thread
// (see useInquiriesThread.js / UploadReportForm.jsx / SmartIdiQModal.jsx) —
// this gives an accurate created_at -> counted duration even for clients
// counted via a quick-count path. updated_at is only used as a last-resort
// fallback for clients counted before counted_at existed (run
// sql/add_counted_at.sql to backfill those), and is a rougher estimate
// since it can drift from unrelated later edits to the row.
const deriveDuration = (row) => {
  if (row.processing_duration) return row.processing_duration;
  if (!deriveIsCompleted(row)) return null;
  const start = new Date(row.created_at).getTime();
  const end = row.counted_at
    ? new Date(row.counted_at).getTime()
    : (row.updated_at ? new Date(row.updated_at).getTime() : Date.now());
  return formatDurationBetween(start, end);
};

// 👇 FIXED: Removed { addToast } from the props 👇
export default function ClientSubmissionListener() {
  const { addToast } = useToast(); // 👈 FIXED: Call the hook directly here
  const { user, loadingAuth } = useAuth();
  const logAction = useLogger();
  const navigate = useNavigate();

  // --- VISIBILITY LOGIC ---
  // Used to be a hand-maintained blocklist of public/portal route prefixes
  // this widget shouldn't appear on — every new public page had to remember
  // to add itself or it leaked the intake queue. Now mounted once inside
  // AdminLayout.jsx instead of globally (see App.jsx), so reaching this
  // component at all already means we're inside the admin route tree; the
  // only real check left is whether an admin is actually logged in.
  const canViewQueue = !!user;

  const [queue, setQueue] = useState([]);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [now, setNow] = useState(Date.now());
  const channelRef = useRef(null);
  const [isMinimized, setIsMinimized] = useState(true);

  // Flips to false the first time a query proves clients.counted_at doesn't
  // exist yet (sql/add_counted_at.sql not run) — avoids repeating a request
  // we already know will fail on every subsequent fetch this session.
  const countedAtAvailableRef = useRef(true);

  // Always-fresh read access to the current queue/company/admin lookups for
  // use inside the realtime callbacks below, without needing them in the
  // subscription effect's dependency array (which would tear down and
  // resubscribe the channel on every queue change).
  const queueRef = useRef(queue);
  useEffect(() => { queueRef.current = queue; }, [queue]);

  const companyCacheRef = useRef(new Map());
  const adminCacheRef = useRef(new Map());

  // Guards against out-of-order responses: if two fetchQueue() calls
  // overlap (e.g. a manual refresh click while a realtime-triggered fetch
  // is still in flight), only the most recently started one is allowed to
  // commit its result — an older, slower response can no longer stomp a
  // newer one.
  const fetchIdRef = useRef(0);

  // Only re-render every 60s for the relative "Xm/Xh" timestamps while the
  // card is actually expanded — no need to tick a background timer (and
  // re-render this always-mounted, app-wide component) while minimized.
  useEffect(() => {
    if (isMinimized) return;
    const timer = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(timer);
  }, [isMinimized]);

  const resolveCompany = async (companyId) => {
    if (!companyId) return null;
    if (companyCacheRef.current.has(companyId)) return companyCacheRef.current.get(companyId);
    const { data } = await supabase
      .from("companies")
      .select("company_name, contact_email")
      .eq("id", companyId)
      .maybeSingle();
    const result = data ? { name: data.company_name, email: data.contact_email } : null;
    companyCacheRef.current.set(companyId, result);
    return result;
  };

  const resolveAdminName = async (adminId) => {
    if (!adminId) return null;
    if (adminCacheRef.current.has(adminId)) return adminCacheRef.current.get(adminId);
    const { data } = await supabase.from("profiles").select("full_name").eq("id", adminId).maybeSingle();
    const name = data?.full_name || null;
    adminCacheRef.current.set(adminId, name);
    return name;
  };

  // --- FETCH QUEUE ---
  const fetchQueue = async () => {
    if (!user) return;
    const requestId = ++fetchIdRef.current;
    setLoadingQueue(true);
    try {
      const yesterday = new Date(Date.now() - QUEUE_WINDOW_MS).toISOString();
      const baseFields = "id, full_name, email, phone, agent, created_at, updated_at, company_id, admin_id, counter, processing_duration, start_inquiries";
      const fields = countedAtAvailableRef.current ? `${baseFields}, counted_at` : baseFields;

      let { data, error } = await supabase
        .from("clients")
        .select(fields)
        .gte("created_at", yesterday)
        .order("created_at", { ascending: false })
        .limit(100);

      // sql/add_counted_at.sql may not have been run yet on this database —
      // rather than let a missing optional column blank out the entire
      // queue, drop it and retry once. Remembered for the rest of this
      // session so we don't repeat the failing request on every fetch.
      if (error && countedAtAvailableRef.current && /counted_at/i.test(error.message || "")) {
        countedAtAvailableRef.current = false;
        console.warn("clients.counted_at not found (run sql/add_counted_at.sql) — falling back without it.");
        ({ data, error } = await supabase
          .from("clients")
          .select(baseFields)
          .gte("created_at", yesterday)
          .order("created_at", { ascending: false })
          .limit(100));
      }

      if (error) throw error;
      if (data) {
        let formatted = data.map(c => ({
            id: c.id,
            name: c.full_name,
            clientEmail: c.email || "",
            clientPhone: c.phone || "",
            addedBy: c.agent || "System",
            company: "Loading...",
            companyEmail: "",
            companyId: c.company_id,
            createdAt: new Date(c.created_at).getTime(),
            assignedToMe: c.admin_id === user.id,
            assignedToOthers: c.admin_id && c.admin_id !== user.id,
            adminId: c.admin_id,
            assigneeName: c.admin_id ? "Loading..." : null,
            isCompleted: deriveIsCompleted(c),
            processingDuration: deriveDuration(c)
        }));

        const companyIds = [...new Set(formatted.map(f => f.companyId).filter(Boolean))];
        const adminIds = [...new Set(formatted.map(f => f.adminId).filter(Boolean))];

        // Only fetch the ones we haven't already cached from a previous
        // bulk load or a realtime-driven single-row lookup.
        const uncachedCompanyIds = companyIds.filter((id) => !companyCacheRef.current.has(id));
        if (uncachedCompanyIds.length > 0) {
            const { data: comps } = await supabase.from("companies").select("id, company_name, contact_email").in("id", uncachedCompanyIds);
            (comps || []).forEach((c) => companyCacheRef.current.set(c.id, { name: c.company_name, email: c.contact_email }));
        }
        if (companyIds.length > 0) {
            formatted = formatted.map((p) => {
                const compData = companyCacheRef.current.get(p.companyId);
                return {
                    ...p,
                    company: compData?.name || "Direct / Individual",
                    companyEmail: compData?.email || ""
                };
            });
        }

        const uncachedAdminIds = adminIds.filter((id) => !adminCacheRef.current.has(id));
        if (uncachedAdminIds.length > 0) {
            const { data: admins } = await supabase.from("profiles").select("id, full_name").in("id", uncachedAdminIds);
            (admins || []).forEach((a) => adminCacheRef.current.set(a.id, a.full_name));
        }
        if (adminIds.length > 0) {
            formatted = formatted.map((p) => ({
                ...p,
                assigneeName: p.adminId ? (adminCacheRef.current.get(p.adminId) || "Staff") : null
            }));
        }

        // Discard this result if a newer fetchQueue() call has since started.
        if (requestId === fetchIdRef.current) setQueue(formatted);
      }
    } catch (err) {
      console.error("Queue fetch error:", err);
    } finally {
      if (requestId === fetchIdRef.current) setLoadingQueue(false);
    }
  };

  useEffect(() => {
    if (!loadingAuth && canViewQueue && user) { fetchQueue(); }
  }, [loadingAuth, canViewQueue, user]);

  // --- ACTIONS ---
  const handleGrab = async (client) => {
    if (!user?.id) return;
    try {
      // Optimistic UI Update
      setQueue((prev) => prev.map(p =>
        p.id === client.id
          ? { ...p, assignedToMe: true, assignedToOthers: false, assigneeName: "You" }
          : p
      ));

      // Conditional on admin_id still being null: if two admins click GRAB
      // at nearly the same time, only the first request to reach the DB
      // actually claims the client — the second gets back no matching row
      // instead of silently overwriting the first admin's claim.
      const { data, error } = await supabase
        .from("clients")
        .update({ admin_id: user.id })
        .eq("id", client.id)
        .is("admin_id", null)
        .select("id")
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        addToast({ message: `${client.name} was already grabbed by someone else.`, title: "Too Slow", variant: "warning", icon: "bi-exclamation-triangle-fill" });
        fetchQueue();
        return;
      }

      logAction({
          action: "grab_client",
          targetId: client.id,
          targetName: client.name,
          details: "Claimed client from FAB queue"
      });

      // --- TRIGGER WEBHOOK ---
      try {
        const WEBHOOK_URL = "https://services.leadconnectorhq.com/hooks/4tb8QYdUxvRnyNgCIUTD/webhook-trigger/c96adb2a-4e80-4183-8292-175a44993269";

        const payload = {
            event: "client_grabbed",
            client_id: client.id,
            client_name: client.name,
            client_email: client.clientEmail,
            client_phone: client.clientPhone,
            company_name: client.company,
            company_email: client.companyEmail,
            assigned_admin_id: user.id,
            grabbed_at: new Date().toISOString()
        };

        fetch(WEBHOOK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        }).catch(err => console.warn("Webhook network issue (non-fatal):", err));

      } catch (webhookErr) {
        console.error("Webhook payload error:", webhookErr);
      }

      addToast({ message: `You grabbed ${client.name}`, title: "Success", variant: "success", icon: "bi-clipboard-check" });
    } catch (err) {
      console.error("Grab error:", err);
      addToast({ message: "Failed to grab. Refreshing list...", title: "Error", variant: "danger" });
      fetchQueue();
    }
  };

  // --- REAL-TIME LISTENER ---
  useEffect(() => {
    if (loadingAuth || !user || !canViewQueue) return;
    if (channelRef.current) return;

    // Handles a brand-new client row. Only enriches with company/admin name
    // and adds it to local state if it actually falls inside the visible
    // 24h window — an insert far outside that window (shouldn't normally
    // happen, but defensive) is simply ignored with no extra network calls.
    const handleClientInsert = async (payload) => {
      const row = payload.new;
      if (!row) return;

      const newClientName = row.full_name || "A new client";
      if (!newClientName.includes("QUICK IMPORT")) {
        addToast({
          title: "New Client Added!",
          message: `${newClientName} just entered the queue.`,
          variant: "success",
          icon: "bi-person-plus-fill",
          sound: "/sounds/notification.mp3"
        });
      }

      const createdAt = new Date(row.created_at).getTime();
      if (Date.now() - createdAt > QUEUE_WINDOW_MS) return;

      try {
        const [company, assigneeName] = await Promise.all([
          resolveCompany(row.company_id),
          row.admin_id ? resolveAdminName(row.admin_id) : Promise.resolve(null),
        ]);

        const entry = {
          id: row.id,
          name: row.full_name,
          clientEmail: row.email || "",
          clientPhone: row.phone || "",
          addedBy: row.agent || "System",
          company: company?.name || "Direct / Individual",
          companyEmail: company?.email || "",
          companyId: row.company_id,
          createdAt,
          assignedToMe: row.admin_id === user.id,
          assignedToOthers: !!row.admin_id && row.admin_id !== user.id,
          adminId: row.admin_id,
          assigneeName: row.admin_id ? (assigneeName || "Staff") : null,
          isCompleted: deriveIsCompleted(row),
          processingDuration: deriveDuration(row),
        };

        setQueue((prev) => (prev.some((p) => p.id === entry.id) ? prev : [entry, ...prev].slice(0, 100)));
      } catch (err) {
        // If enrichment fails for any reason, fall back to a full refetch
        // rather than silently dropping the new client from the queue.
        console.warn("Insert enrichment failed, falling back to full refetch:", err);
        fetchQueue();
      }
    };

    // Handles an update to an existing client row. If it's not currently in
    // our local queue (outside the 24h window, or never loaded), there's
    // nothing to patch — ignored with zero network calls, unlike the old
    // behavior of refetching the entire queue for every single client edit
    // anywhere in the system.
    const handleClientUpdate = (payload) => {
      const row = payload.new;
      if (!row) return;

      setQueue((prev) => {
        const idx = prev.findIndex((p) => p.id === row.id);
        if (idx === -1) return prev;

        const existing = prev[idx];
        const next = [...prev];
        next[idx] = {
          ...existing,
          adminId: row.admin_id,
          assignedToMe: row.admin_id === user.id,
          assignedToOthers: !!row.admin_id && row.admin_id !== user.id,
          assigneeName: !row.admin_id
            ? null
            : row.admin_id === user.id
              ? "You"
              : (row.admin_id === existing.adminId ? existing.assigneeName : (adminCacheRef.current.get(row.admin_id) || "Staff")),
          isCompleted: deriveIsCompleted(row),
          processingDuration: deriveDuration(row),
        };
        return next;
      });

      // If the assignee changed to an admin we haven't resolved a name for
      // yet, look it up in the background and patch it in once known —
      // doesn't block the immediate state update above.
      if (row.admin_id && !adminCacheRef.current.has(row.admin_id)) {
        resolveAdminName(row.admin_id).then((name) => {
          if (!name) return;
          setQueue((cur) => cur.map((p) => (p.id === row.id && p.adminId === row.admin_id ? { ...p, assigneeName: name } : p)));
        });
      }
    };

    const handleClientDelete = (payload) => {
      const oldRow = payload.old;
      if (!oldRow?.id) return;
      setQueue((prev) => prev.filter((p) => p.id !== oldRow.id));
    };

    const channel = supabase.channel("realtime:intake-queue")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "clients" }, handleClientInsert)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "clients" }, handleClientUpdate)
      .on("postgres_changes", { event: "DELETE", schema: "public", table: "clients" }, handleClientDelete)
      // Listen for ANY documents uploaded to the system
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "client_documents" }, async (payload) => {
          const row = payload.new;
          if (!row) return;

          const fileName = row.file_name || 'A new document';
          const clientId = row.client_id;

          let clientName = "a client";
          try {
            if (clientId) {
              // Reuse a name we already have in the local queue before
              // spending a network round trip on it.
              const cached = queueRef.current.find((p) => p.id === clientId);
              if (cached?.name) {
                clientName = cached.name;
              } else {
                const { data, error } = await supabase
                    .from('clients')
                    .select('full_name')
                    .eq('id', clientId)
                    .maybeSingle();
                if (error) throw error;
                if (data?.full_name) clientName = data.full_name;
              }
            }
          } catch (err) {
            console.warn("Could not resolve client name for document toast:", err);
          }

          addToast({
            title: "Document Uploaded",
            message: `${fileName} was uploaded for ${clientName}.`,
            variant: "info",
            icon: "bi-file-earmark-text",
            sound: "/sounds/docs.mp3" // Added sound here for consistency!
          });
      })
      .subscribe();

    channelRef.current = channel;
    return () => { if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; } };
  }, [canViewQueue, user, loadingAuth, addToast]); // addToast is now pulled from context and safe to use in deps

  // --- RENDER HELPERS ---
  const pendingCount = queue.filter(q => !q.isCompleted).length;
  const getTimeLabel = (ts) => {
      const diff = Math.floor((now - ts) / 60000);
      if (diff < 1) return "Now";
      if (diff > 60) return `${Math.floor(diff/60)}h`;
      return `${diff}m`;
  };

  if (!canViewQueue) return null;

  return (
    <div className="position-fixed bottom-0 end-0 p-3" style={{ zIndex: 2000 }}>
      {/* --- FLOATING CIRCLE BUTTON --- */}
      {isMinimized ? (
        <div className="position-relative">
          <Button
            variant={pendingCount > 0 ? "danger" : "dark"}
            className="rounded-circle shadow-lg d-flex align-items-center justify-content-center p-0"
            style={{ width: '60px', height: '60px', transition: 'transform 0.2s' }}
            onClick={() => { setNow(Date.now()); setIsMinimized(false); }}
            onMouseOver={(e) => e.currentTarget.style.transform = 'scale(1.1)'}
            onMouseOut={(e) => e.currentTarget.style.transform = 'scale(1.0)'}
          >
            <i className={`bi ${loadingQueue ? 'bi-arrow-clockwise' : 'bi-person-lines-fill'} fs-4 ${loadingQueue ? 'spinner-border spinner-border-sm' : ''}`}></i>
          </Button>

          {pendingCount > 0 && (
            <Badge
              pill
              bg="warning"
              text="dark"
              className="position-absolute top-0 start-100 translate-middle shadow-sm border border-2 border-white fw-bold"
              style={{ fontSize: '0.9rem', zIndex: 1 }}
            >
              {pendingCount}
            </Badge>
          )}
        </div>
      ) : (
        /* --- EXPANDED QUEUE CARD --- */
        <Card className="shadow-lg border-0 mb-2 animate__animated animate__fadeInUp" style={{ width: '380px', maxWidth: '90vw' }}>
            <Card.Header
                className={`d-flex justify-content-between align-items-center ${pendingCount > 0 ? 'bg-danger text-white' : 'bg-dark text-white'}`}
                style={{ borderTopLeftRadius: '10px', borderTopRightRadius: '10px' }}
            >
                <div className="d-flex align-items-center gap-2">
                    <i className="bi bi-lightning-charge-fill"></i>
                    <strong className="mb-0">Pipeline (24h)</strong>
                </div>
                <div className="d-flex gap-2 align-items-center">
                    <Button variant="link" size="sm" className="p-0 text-white" onClick={fetchQueue}>
                        <i className="bi bi-arrow-clockwise"></i>
                    </Button>
                    <Button variant="link" size="sm" className="p-0 text-white" onClick={() => setIsMinimized(true)}>
                        <i className="bi bi-dash-lg fs-5"></i>
                    </Button>
                </div>
            </Card.Header>

            <ListGroup variant="flush" style={{ maxHeight: '50vh', overflowY: 'auto' }}>
                {queue.length === 0 ? (
                    <div className="p-4 text-center text-muted">No recent activity.</div>
                ) : (
                    queue.map(client => (
                        <ListGroup.Item
                            key={client.id}
                            className="p-3 border-start border-4"
                            style={{
                                borderColor: client.isCompleted ? '#198754' : (client.assignedToMe ? '#ffc107' : '#0d6efd'),
                                backgroundColor: client.isCompleted ? '#f8fff9' : 'inherit'
                            }}
                        >
                            <div className="d-flex justify-content-between align-items-start">
                                <div>
                                    <h6 className="fw-bold mb-0" style={{ color: '#2c3e50' }}>{client.name}</h6>
                                    <small className="text-muted">{client.company}</small>
                                </div>
                                <Badge bg="light" text="dark" className="border shadow-xs">{getTimeLabel(client.createdAt)}</Badge>
                            </div>

                            <div className="d-flex justify-content-between align-items-center mt-2">
                                <small className="text-muted" style={{ fontSize: '0.7rem' }}>Added by {client.addedBy}</small>
                                {client.isCompleted ? (
                                    <Badge bg="success" pill><i className="bi bi-check2-all me-1"></i>{client.processingDuration || "Done"}</Badge>
                                ) : (
                                    client.assignedToMe ? (
                                        <Button size="sm" variant="primary" className="py-0 px-2 fw-bold" onClick={() => { navigate(`/clients/${client.id}`); setIsMinimized(true); }}>
                                            COUNT IT
                                        </Button>
                                    ) : (
                                        <Button size="sm" variant="outline-success" className="py-0 px-2 fw-bold" onClick={() => handleGrab(client)} disabled={client.assignedToOthers}>
                                            {client.assignedToOthers ? "TAKEN" : "GRAB"}
                                        </Button>
                                    )
                                )}
                            </div>
                        </ListGroup.Item>
                    ))
                )}
            </ListGroup>
        </Card>
      )}
    </div>
  );
}
