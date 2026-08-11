// src/components/AlertBell.jsx
import { useEffect, useMemo, useState } from "react";
import { Button, Badge, Modal, Spinner, Tabs, Tab } from "react-bootstrap";
import { supabase } from "../../supabaseClient";

const BUREAU_CODE_MAP = {
  EQ: "Equifax",
  TU: "TransUnion",
  EX: "Experian",
};

function normalizeBureau(b) {
  if (!b) return null;
  const s = String(b).trim();
  if (BUREAU_CODE_MAP[s]) return BUREAU_CODE_MAP[s];
  // fall back: title-case arbitrary input (e.g., "TransUnion", "Experian")
  return s
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function formatBureaus(list) {
  const arr = Array.from(
    new Set((Array.isArray(list) ? list : []).map(normalizeBureau).filter(Boolean))
  );
  if (arr.length === 0) return null;
  if (arr.length === 1) return arr[0];
  if (arr.length === 2) return `${arr[0]} & ${arr[1]}`;
  return `${arr.slice(0, -1).join(", ")} & ${arr[arr.length - 1]}`;
}

export default function AlertBell() {
  // docs
  const [rowsDocs, setRowsDocs] = useState([]);
  const [loadingDocs, setLoadingDocs] = useState(true);

  // calls
  const [rowsCalls, setRowsCalls] = useState([]);
  const [loadingCalls, setLoadingCalls] = useState(true);

  // ui
  const [open, setOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("docs"); // "docs" | "calls"

  // ======= DATA LOADERS (exact fields you provided) =======

  const fetchDocs = async () => {
    setLoadingDocs(true);
    const { data, error } = await supabase
      .from("docs_reminders")
      .select(`
        id,
        client_id,
        admin_id,
        clients:client_id ( full_name ),
        note,
        bureaus,
        first_seen,
        last_seen
      `)
      .order("last_seen", { ascending: false, nullsFirst: false })
      .limit(500);

    if (error) {
      console.error("Error loading doc reminders:", error.message);
      setRowsDocs([]);
    } else {
      setRowsDocs(data || []);
    }
    setLoadingDocs(false);
  };

  const fetchCalls = async () => {
    setLoadingCalls(true);
    const { data, error } = await supabase
      .from("dispute_followup_queue")
      .select(`
        id,
        client_id,
        client_name,
        admin_id,
        admin_name,
        bureaus_disputed,
        created_at,
        updated_at
      `)
      .order("updated_at", { ascending: false })
      .limit(500);

    if (error) {
      console.error("Error loading call reminders:", error.message);
      setRowsCalls([]);
    } else {
      // ✅ set calls, not docs
      setRowsCalls(data || []);
    }
    setLoadingCalls(false);
  };

  useEffect(() => {
    // initial load
    fetchDocs();
    fetchCalls();

    // realtime: docs
    const chDocs = supabase
      .channel("docs-reminders")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "docs_reminders" },
        () => fetchDocs()
      )
      .subscribe();

    // realtime: calls queue
    const chCalls = supabase
      .channel("dispute-followup-queue")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dispute_followup_queue" },
        () => fetchCalls()
      )
      .subscribe();

    return () => {
      supabase.removeChannel(chDocs);
      supabase.removeChannel(chCalls);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ======= DERIVED ITEMS =======

// mapper: docItems
const docItems = useMemo(() => {
  return (rowsDocs || []).map((r) => {
    const bureausArr = Array.isArray(r.bureaus) ? r.bureaus : [];
    return {
      id: r.id,
      client_id: r.client_id,
      // ✅ use the joined full_name; fallback to id only if really needed
      name: r.clients?.full_name?.trim() || null,
      bureausArr,
      when: r.last_seen ? new Date(r.last_seen) : (r.first_seen ? new Date(r.first_seen) : null),
      note: r.note || "",
    };
  });
}, [rowsDocs]);

  const callItems = useMemo(() => {
    return (rowsCalls || []).map((r) => {
      const bureausArr = Array.isArray(r.bureaus_disputed) ? r.bureaus_disputed : [];
      return {
        id: r.id,
        client_id: r.client_id,
        name: r.client_name || "Unnamed Client",
        company: "—", // not available in this shape
        bureausArr,
        when: r.updated_at ? new Date(r.updated_at) : (r.created_at ? new Date(r.created_at) : null),
        note: r.admin_name ? `Owner: ${r.admin_name}` : "",
      };
    });
  }, [rowsCalls]);

  const docsCount = docItems.length;
  const callsCount = callItems.length;
  const totalCount = docsCount + callsCount;

  return (
    <>
      <Button
        variant="warning"
        className="position-relative"
        onClick={() => setOpen(true)}
        title="Clients needing follow-up"
      >
        <span role="img" aria-label="follow-ups">🔔</span> Follow-ups
        {totalCount > 0 && (
          <Badge
            bg="danger"
            pill
            className="position-absolute top-0 start-100 translate-middle"
          >
            {totalCount}
          </Badge>
        )}
      </Button>

      <Modal show={open} onHide={() => setOpen(false)} centered scrollable>
        <Modal.Header closeButton>
          <Modal.Title>Client Follow-ups</Modal.Title>
        </Modal.Header>

        <Modal.Body>
          <Tabs
            activeKey={activeTab}
            onSelect={(k) => setActiveTab(k || "docs")}
            className="mb-3 d-flex flex-row"
          >
            <Tab
              eventKey="docs"
              title={
                <>
                  <span role="img" aria-label="docs">📄</span>{" "}
                  Docs{" "}
                  {docsCount > 0 && (
                    <Badge bg="secondary" pill className="ms-1">
                      {docsCount}
                    </Badge>
                  )}
                </>
              }
            >
              {loadingDocs && (
                <div className="py-4 text-center">
                  <Spinner animation="border" size="sm" />
                </div>
              )}

              {!loadingDocs && docsCount === 0 && (
                <div className="text-muted">No clients currently need document follow-up.</div>
              )}

              {!loadingDocs &&
                docItems.map((row) => {
                  const bureausLabel = formatBureaus(row.bureausArr);
                  return (
                    <div
                      key={row.id}
                      className="d-flex justify-content-between align-items-center border rounded p-2 mb-2"
                    >
                      <div>
                        <div className="fw-semibold">
                          <a
                            href={`/clients/${row.client_id}`}
                            className="text-decoration-none"
                            aria-label={`Open client ${row.name || row.client_id}`}
                          >
                            {row.name || row.client_id}
                          </a>{" "}
                          {bureausLabel ? (
                            <>
                              — <span className="text-muted">{bureausLabel}</span>
                            </>
                          ) : null}
                        </div>
                        <div className="small text-muted">
                          {/* company omitted (not in this shape) */}
                          {row.when?.toLocaleString?.() ?? ""}
                        </div>
                        <div className="small mt-1">{row.note}</div>
                      </div>
                    </div>
                  );
                })}
            </Tab>

            <Tab
              eventKey="calls"
              title={
                <>
                  <span role="img" aria-label="calls">📞</span>{" "}
                  Calls{" "}
                  {callsCount > 0 && (
                    <Badge bg="secondary" pill className="ms-1">
                      {callsCount}
                    </Badge>
                  )}
                </>
              }
            >
              {loadingCalls && (
                <div className="py-4 text-center">
                  <Spinner animation="border" size="sm" />
                </div>
              )}

              {!loadingCalls && callsCount === 0 && (
                <div className="text-muted">No clients currently need call follow-up.</div>
              )}

              {!loadingCalls &&
                callItems.map((row) => {
                  const bureausLabel = formatBureaus(row.bureausArr);
                  return (
                    <div
                      key={row.id}
                      className="d-flex justify-content-between align-items-center border rounded p-2 mb-2"
                    >
                      <div>
                        <div className="fw-semibold">
                          <a
                            href={`/clients/${row.client_id}`}
                            className="text-decoration-none"
                            aria-label={`Open client ${row.name}`}
                          >
                            {row.name}
                          </a>{" "}
                          {bureausLabel ? (
                            <>
                              — <span className="text-muted">{bureausLabel}</span>
                            </>
                          ) : null}
                        </div>
                        <div className="small text-muted">
                          {row.when?.toLocaleString?.() ?? ""}
                        </div>
                        <div className="small mt-1">{row.note}</div>
                      </div>
                    </div>
                  );
                })}
            </Tab>
          </Tabs>
        </Modal.Body>

        <Modal.Footer>
          <Button variant="dark" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button
            variant="outline-secondary"
            onClick={() => {
              if (activeTab === "docs") fetchDocs();
              else fetchCalls();
            }}
          >
            Refresh
          </Button>
        </Modal.Footer>
      </Modal>
    </>
  );
}
