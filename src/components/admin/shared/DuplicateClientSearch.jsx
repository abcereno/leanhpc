// src/components/admin/shared/DuplicateClientSearch.jsx
//
// Phase 3's "smarter New Client dedup" — rendered near the top of a New
// Client form, before staff start filling in personal info, so they can
// check whether this person already exists. Purely advisory: it doesn't
// block or change what the form's own submit does (that's still
// clientDuplicateRound.js's exact-email-match check at insert time) — this
// is a wider, earlier name/email/phone search catching the case that
// can't: a returning client typing their name with a different email than
// the one on file.
//
// "View" links straight to the matched person's most recent clients row
// (/clients/:id, already routed) rather than needing new deep-link
// plumbing in AdminClientList.jsx — from there, staff can use the
// "New Order" Tools action (ClientHeader.jsx) instead of creating a
// duplicate person here.
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Form, Spinner } from "react-bootstrap";
import { searchPeople } from "../../../utils/peopleSearch";

export default function DuplicateClientSearch() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearched(false);
      return undefined;
    }
    setLoading(true);
    let active = true;
    const timer = setTimeout(async () => {
      const rows = await searchPeople(q);
      if (!active) return;
      setResults(rows);
      setSearched(true);
      setLoading(false);
    }, 350);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [query]);

  return (
    <div className="border rounded p-3 mb-3 bg-light">
      <Form.Label className="fw-semibold small text-muted text-uppercase mb-1">
        <i className="bi bi-search me-1" /> Check for an existing client first
      </Form.Label>
      <Form.Control
        type="text"
        placeholder="Search by name, email, or phone..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
      />
      {loading && (
        <div className="small text-muted mt-2">
          <Spinner animation="border" size="sm" className="me-2" />
          Searching…
        </div>
      )}
      {!loading && searched && results.length === 0 && (
        <div className="small text-muted mt-2">No existing client matches "{query}" — safe to add as new.</div>
      )}
      {!loading && results.length > 0 && (
        <div className="mt-2 d-flex flex-column gap-2">
          {results.map((r) => (
            <div
              key={r.person_id}
              className="d-flex justify-content-between align-items-center bg-white border rounded px-2 py-1 small flex-wrap gap-2"
            >
              <div>
                <span className="fw-semibold">{r.full_name || "—"}</span>{" "}
                <span className="text-muted">{r.email || "no email"} • {r.phone || "no phone"}</span>{" "}
                <span className="text-muted">
                  — {r.order_count} order{Number(r.order_count) === 1 ? "" : "s"}
                </span>
              </div>
              {r.latest_client_id && (
                <Link
                  to={`/clients/${r.latest_client_id}`}
                  className="btn btn-sm btn-outline-primary"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  View Profile
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
