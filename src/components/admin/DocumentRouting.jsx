import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { Container, Card, Table, Form, Button, Badge, Spinner, Modal, Nav } from "react-bootstrap";
import { supabase } from "../../supabaseClient";
import { useToast } from "../shared/ui/ToastNotifier";
import { resolveServiceId, SERVICES } from "../../utils/services";
import LogDocumentModal from "./client-profile/modals/LogDocumentModal";
import LogChecklistItemModal from "./client-profile/modals/LogChecklistItemModal";

// Optional service-type filter (the dropdown below, next to the round
// tabs) — NOT a hard exclusion. Every paid client belongs in this queue
// regardless of service; this only lets staff narrow the currently-
// selected round down to one specific service (any of SERVICES, e.g. Case
// Management, Inquiry Deletion) when that's useful, via the same
// resolveServiceId() every other service-aware read site in the app uses
// (handles the legacy casing-inconsistent dispute_method data and the
// service_id backfill in one place). "all" (the default) shows everyone.

// Matches sql/gate_exp_calls_on_docs_round.sql's own 7-day gate — a round
// past this age that still isn't fully submitted will never auto-queue an
// EXP, TU, or EQ call on its own, so it needs a person to actually finish
// it rather than just waiting it out further.
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// One shared cell for the EXP/TU/EQ columns — used to be three near-copies
// of the same checkbox markup with a hardcoded color class each. Pulled out
// once rather than tripled again when Last Docs Submitted and Last Called
// (both per bureau — see lastDocsSubmittedByClient/lastCalledByClient
// above) needed to be squeezed into the same cell instead of costing 6+
// more columns on an already-wide table — two small muted lines under the
// checkbox instead of separate "Last Docs Submitted EXP/TU/EQ" and "Last
// Called EXP/TU/EQ" columns.
// Color-codes the "last called" badge by outcome so a glance at the pill's
// color tells you the temperature of the last call, not just its text —
// matches IS_DEFINITIVE_RESULT's options in LogCallModal.jsx.
const CALL_RESULT_VARIANT = {
  DELETED: "success",
  DISPUTED: "info",
  "STILL UNDER DISPUTE": "info",
  "PARTLY DISPUTED": "info",
  "DOCUMENTS NOT YET RECEIVED": "warning",
  "INVALID FTC": "danger",
  "UNABLE TO PASS AUTHENTICATION": "danger",
  "CALL DISCONNECTED": "secondary",
};

function BureauCell({ isDone, colorClass, checked, onToggle, onLogDocs, lastDocsSubmitted, lastCalled }) {
  const shortDate = (d) => new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return (
    <td className={`text-center ${isDone ? "bg-light text-muted" : `${colorClass} bg-opacity-10`}`}>
      {isDone ? (
        <i className="bi bi-check-circle-fill text-success"></i>
      ) : (
        <Form.Check className="d-flex justify-content-center" checked={checked} onChange={() => (checked ? onToggle() : onLogDocs())} />
      )}
      {lastDocsSubmitted && (
        <div className="mt-1">
          <Badge bg="light" text="dark" className="border fw-normal" style={{ fontSize: "0.62rem" }} title="Last docs submitted">
            <i className="bi bi-file-earmark-text me-1"></i>{shortDate(lastDocsSubmitted.submittedAt)}
          </Badge>
        </div>
      )}
      {lastCalled && (
        <div className="mt-1">
          <Badge
            bg={CALL_RESULT_VARIANT[lastCalled.result] || "secondary"}
            className="fw-normal"
            style={{ fontSize: "0.62rem", cursor: lastCalled.reason ? "help" : undefined, whiteSpace: "normal" }}
            title={lastCalled.reason ? `Last call reason: ${lastCalled.reason}` : "Last called"}
          >
            <i className="bi bi-telephone me-1"></i>{shortDate(lastCalled.calledAt)} · {lastCalled.result}
          </Badge>
        </div>
      )}
    </td>
  );
}

export default function DocumentRouting() {
  const { addToast } = useToast();
  const [tasks, setTasks] = useState([]);
  const [admins, setAdmins] = useState([]);
  const [clientsList, setClientsList] = useState([]); 
  const [clientRounds, setClientRounds] = useState({}); 
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null); 
  const [refreshTrigger, setRefreshTrigger] = useState(0); 

  const [showModal, setShowModal] = useState(false);
  const [adding, setAdding] = useState(false);
  const [newTask, setNewTask] = useState({ client_id: "", round_count: 1, assigned_admin_id: "" });

  // Checking (not unchecking) EXP/TU/EQ "submitted" opens Log Document
  // instead of silently flipping the box — that checkbox means "docs went
  // out to this bureau," which is exactly what Log Document is for
  // (webhook + note + clears the docs reminder). { task, bureau, field } | null.
  const [logDocsFor, setLogDocsFor] = useState(null);

  // Same "checking opens a log prompt instead of instant-toggling" pattern
  // as logDocsFor above, but for the four generic checklist checkboxes
  // (FTC, CFPB, Postalocity, Certified Postalocity) — these log into the
  // client's Activity Thread (comments table) via LogChecklistItemModal
  // instead of document_logs, since there's no per-bureau webhook/reminder
  // to clear for them. { task, field, label } | null.
  const [logChecklistFor, setLogChecklistFor] = useState(null);

  // Round tabs — the flat "every client, every round, one giant table"
  // view was overwhelming (12 columns × every active client at once), so
  // this groups `tasks` by round_count and shows one round at a time,
  // switched via a plain Nav (not react-bootstrap's Tabs/Tab pairing,
  // which would require duplicating the whole <Table> once per round —
  // Nav is decoupled from its content, so the table below stays a single
  // copy that just reads whichever round is currently selected).
  const [activeRound, setActiveRound] = useState(null);

  const roundGroups = useMemo(() => {
    const groups = {};
    tasks.forEach((t) => {
      const r = t.round_count || 1;
      if (!groups[r]) groups[r] = [];
      groups[r].push(t);
    });
    return groups;
  }, [tasks]);

  const roundNumbers = useMemo(
    () => Object.keys(roundGroups).map(Number).sort((a, b) => a - b),
    [roundGroups]
  );

  // Keep the selected round valid as `tasks` reloads/changes — falls back
  // to the lowest round number with anything pending, and clears to null
  // once nothing is pending at all (renders the empty state instead of a
  // tab strip with nothing under it).
  useEffect(() => {
    if (roundNumbers.length === 0) {
      setActiveRound(null);
      return;
    }
    if (activeRound === null || !roundNumbers.includes(activeRound)) {
      setActiveRound(roundNumbers[0]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roundNumbers]);

  // Optional narrowing on top of the selected round — "all" (default)
  // shows every paid client in this round same as always; any other value
  // is a SERVICES id (e.g. "credit_repair", "inquiry_deletion") and narrows
  // to just that service's clients. Never the other way around — this must
  // never be able to hide clients unless someone explicitly picks a
  // specific service.
  const [serviceFilter, setServiceFilter] = useState("all");

  const roundTasks = activeRound !== null ? (roundGroups[activeRound] || []) : [];
  const visibleTasks = serviceFilter === "all"
    ? roundTasks
    : roundTasks.filter((t) => resolveServiceId(t.clients) === serviceFilter);

  // 1. SMART FETCH DATA
  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);

      // Self-healing pass (sql/gate_exp_calls_on_docs_round.sql) — auto-
      // queues EXP/TU/EQ calls once 7 days have passed since the latest
      // docs round was created AND FTC/CFPB/that bureau's own submitted
      // checkbox are all checked, so this list is correct even if nobody
      // has opened Document/Call Routing in a while. Missing-function
      // failure (migration not run yet) just means no auto-healing this
      // load — everything below still works off whatever rows already
      // exist.
      const { error: syncErr } = await supabase.rpc('sync_all_workflow_queues');
      if (syncErr && !/does not exist/i.test(syncErr.message || '')) {
        console.warn('sync_all_workflow_queues failed (run sql/gate_exp_calls_on_docs_round.sql):', syncErr.message);
      }

      const [adminRes, clientRes, callRes, docRes, allDocsRes] = await Promise.all([
          supabase.from('profiles').select('id, full_name').order('full_name'),
          // .range(0, 99999) — without it, Supabase's default 1000-row cap
          // silently truncates this list once the client count passes 1000.
          // Any client sorted (alphabetically, by full_name) past that
          // cutoff then fails the lookup below and renders as "Unknown
          // Client" even though the client record is completely fine —
          // clicking through still resolves the real name because that
          // link fetches the client by id directly, bypassing this list
          // entirely. Same fix already applied to the exact same cap in
          // useAdminClients.js. If "Unknown Client" rows still show up
          // despite this .range() (e.g. a Supabase project-level API "Max
          // Rows" setting capping every request regardless of the range
          // requested), the backfill query below catches it as a second
          // layer — see its own comment.
          supabase.from('clients').select('id, full_name, is_paid, is_paused, exp_completed, tu_completed, eq_completed, admin_id, dispute_method, service_id').order('full_name', { ascending: true }).range(0, 99999),
          supabase.from('call_routing').select('client_id').eq('status', 'PENDING').range(0, 99999),
          // Same 1000-row cap risk as the clients query above, but worse
          // here — a truncated result wouldn't just mislabel a name, it
          // would drop the routing row (task) entirely from the queue.
          supabase.from('document_routing').select('*, profiles:assigned_admin_id (full_name)').eq('status', 'PENDING').range(0, 99999),
          supabase.from('document_routing').select('client_id, round_count').range(0, 99999)
      ]);

      if (adminRes.data) setAdmins(adminRes.data);

      const allClients = clientRes.data || [];

      const activeCalls = callRes.data || [];
      const activeDocs = docRes.data || [];
      const allDocs = allDocsRes.data || [];

      // Belt-and-suspenders backfill: the bulk clients fetch above already
      // carries .range(0, 99999) specifically to dodge PostgREST's default
      // 1000-row cap, but if a client referenced by a pending doc task is
      // STILL missing from it for any other reason (e.g. a project-level
      // API "Max Rows" setting in Supabase capping every request
      // regardless of the range requested, or some other edge case), a
      // single-row-by-id lookup always works — that's exactly why clicking
      // through to a client's profile always resolves the real name even
      // when this list shows "Unknown Client" for the same row. Rather
      // than leave that mismatch standing, resolve it here too instead of
      // falling back to a placeholder.
      let effectiveClients = allClients;
      const knownClientIds = new Set(allClients.map(c => c.id));
      const missingClientIds = [...new Set(activeDocs.map(t => t.client_id))].filter(id => !knownClientIds.has(id));
      if (missingClientIds.length > 0) {
        console.warn(
          `DocumentRouting: ${missingClientIds.length} client(s) referenced by pending docs tasks were missing from the bulk clients fetch (${allClients.length} loaded) — backfilling individually. If this keeps happening, check the Supabase project's API "Max Rows" setting (Settings → API).`,
          missingClientIds
        );
        const { data: backfilled } = await supabase
          .from('clients')
          .select('id, full_name, is_paid, is_paused, exp_completed, tu_completed, eq_completed, admin_id, dispute_method, service_id')
          .in('id', missingClientIds);
        if (backfilled?.length) {
          effectiveClients = [...allClients, ...backfilled];
        }
      }
      setClientsList(effectiveClients);

      // Last Docs Submitted, PER BUREAU — most recent document_logs entry
      // per client, broken out by bureau just like lastCalledByClient below
      // (a client can easily have fresh EXP docs logged but nothing for TU
      // in weeks). LogDocumentModal inserts one of these every time an
      // EXP/TU/EQ "submitted" checkbox gets checked here or on the client
      // profile — its `bureau` column is a text[] since one log entry can
      // cover MULTIPLE bureaus at once (e.g. EXP+TU checked together in the
      // same submission), unlike call_logs where each row is exactly one
      // bureau. So each log row can update up to three bureaus' "most
      // recent" at once.
      //
      // Scoped to PAID clients only (+ anyone with an active doc task) —
      // `effectiveClients` is every row in the clients table (leads,
      // unpaid, everything, no is_paid filter on that query), and this
      // page can only ever show paid clients anyway. Passing the FULL
      // unfiltered client list into a single `.in('client_id', ids)` call
      // meant thousands of UUIDs in one request — well past what a
      // PostgREST `.in()` filter reliably handles, so the request was
      // silently failing (or returning nothing) and every row rendered
      // "Never" regardless of actual history. Narrowing to paid clients
      // cuts this down to the actual relevant set; chunking on top of
      // that is a second safety margin so this can't quietly break again
      // purely from the paid client count growing.
      const candidateClientIds = [...new Set([
        ...effectiveClients.filter(c => c.is_paid).map(c => c.id),
        ...activeDocs.map(t => t.client_id),
      ])];
      const lastDocsSubmittedByClient = {}; // client_id -> { EXP: {...}|undefined, TU: {...}|undefined, EQ: {...}|undefined }
      if (candidateClientIds.length > 0) {
        const CHUNK_SIZE = 200;
        const chunks = [];
        for (let i = 0; i < candidateClientIds.length; i += CHUNK_SIZE) {
          chunks.push(candidateClientIds.slice(i, i + CHUNK_SIZE));
        }
        const chunkResults = await Promise.all(chunks.map(ids =>
          supabase
            .from('document_logs')
            .select('client_id, submitted_at, bureau')
            .in('client_id', ids)
            .not('submitted_at', 'is', null)
            .order('submitted_at', { ascending: false })
        ));
        chunkResults.forEach(({ data: docLogs, error: docLogsErr }) => {
          if (docLogsErr) {
            console.warn('Could not load a batch of document_logs for Last Docs Submitted:', docLogsErr.message);
            return;
          }
          // Ordered descending and reduced client-side (Supabase's JS
          // client has no GROUP BY MAX) — the FIRST row seen per
          // (client_id, bureau) within its own chunk is that pair's most
          // recent, but since a given client only ever appears in ONE
          // chunk (candidateClientIds is deduped before splitting), this
          // still correctly picks the true most-recent row overall.
          (docLogs || []).forEach(log => {
            const bureaus = Array.isArray(log.bureau) ? log.bureau : [];
            if (bureaus.length === 0) return; // no bureau recorded on this log — nothing to attribute it to
            if (!lastDocsSubmittedByClient[log.client_id]) lastDocsSubmittedByClient[log.client_id] = {};
            const perClient = lastDocsSubmittedByClient[log.client_id];
            bureaus.forEach(rawBureau => {
              const bureau = String(rawBureau || '').toUpperCase().trim();
              if (!['EXP', 'TU', 'EQ'].includes(bureau)) return;
              if (perClient[bureau]) return; // already have a more recent one for this bureau
              perClient[bureau] = { submittedAt: log.submitted_at };
            });
          });
        });
      }

      // Last Called + Reason, PER BUREAU — most recent call_logs entry per
      // client, kept separately for EXP/TU/EQ (a client can easily have a
      // fresh EXP call but a TU call from weeks ago, so collapsing all
      // three into one "last called" date hides that). LogCallModal insert
      // — same table CallLogs.jsx reads. This is what explains round
      // inflation: LogCallModal's "DOCUMENTS NOT YET RECEIVED" result opens
      // a brand-new document_routing round every time it's logged, with no
      // check for whether the current round's docs were ever actually
      // completed — so a client called daily can rack up a new round each
      // day even though nothing about their docs changed. Showing each
      // bureau's last call date + result (rendered inside that bureau's own
      // EXP/TU/EQ column below, not a separate column — see BureauCell) lets
      // staff see AT A GLANCE why a client bounced back to Docs Routing
      // without digging through Call Logs, and without adding 6 more
      // columns to an already-wide table. Reuses the same
      // candidateClientIds/chunking as Last Docs Submitted above — same
      // universe of clients, same oversized-.in()-request risk.
      const lastCalledByClient = {}; // client_id -> { EXP: {...}|undefined, TU: {...}|undefined, EQ: {...}|undefined }
      if (candidateClientIds.length > 0) {
        const CHUNK_SIZE = 200;
        const chunks = [];
        for (let i = 0; i < candidateClientIds.length; i += CHUNK_SIZE) {
          chunks.push(candidateClientIds.slice(i, i + CHUNK_SIZE));
        }
        const chunkResults = await Promise.all(chunks.map(ids =>
          supabase
            .from('call_logs')
            .select('client_id, call_date, created_at, exp_result, tu_result, eq_result, reason')
            .in('client_id', ids)
            .order('created_at', { ascending: false })
        ));
        chunkResults.forEach(({ data: logs, error: logsErr }) => {
          if (logsErr) {
            console.warn('Could not load a batch of call_logs for Last Called:', logsErr.message);
            return;
          }
          (logs || []).forEach(log => {
            // Only one of exp/tu/eq_result is ever set per row (LogCallModal
            // submits one bureau at a time) — whichever is present is this
            // call's bureau + outcome.
            const bureau =
              log.exp_result ? 'EXP' :
              log.tu_result ? 'TU' :
              log.eq_result ? 'EQ' :
              null;
            if (!bureau) return;
            const existing = lastCalledByClient[log.client_id];
            if (existing?.[bureau]) return; // first seen per (client, bureau) per chunk = most recent, same reasoning as Last Docs Submitted above
            if (!existing) lastCalledByClient[log.client_id] = {};
            lastCalledByClient[log.client_id][bureau] = {
              calledAt: log.created_at || log.call_date,
              result: log[`${bureau.toLowerCase()}_result`],
              reason: log.reason || null,
            };
          });
        });
      }

      const maxRounds = {};
      allDocs.forEach(doc => {
          if (!maxRounds[doc.client_id] || doc.round_count > maxRounds[doc.client_id]) {
              maxRounds[doc.client_id] = doc.round_count;
          }
      });
      setClientRounds(maxRounds);

      let formattedTasks = [];
      const existingDocClientIds = new Set();
      
      // A. Process Existing Pending Doc Tasks
      //
      // Used to also hide a row here once the client had ANY active
      // call_routing entry (inCallQueue) — meant to avoid double-showing a
      // client staff were already working in Call Routing, but it had a
      // real gap: the self-healing 7-day sync (sql/self_healing_workflow_
      // queues.sql) auto-queues a call WITHOUT ever marking this
      // document_routing row COMPLETED (only the manual "Send" button, via
      // process_docs_to_calls, does that) — so a client who reached Call
      // Routing through the auto-queue, not a manual Send, would silently
      // vanish from Docs Routing entirely, with nothing left anywhere
      // showing their docs checklist was still open. Per explicit request:
      // every paid, not-fully-done client should show up here regardless
      // of whether they've already been sent to calls — `alreadyInCallQueue`
      // is kept (not dropped) so the row can still warn about it and the
      // Send button can guard against double-queuing a second call_routing
      // row for the same client (see the Send button below).
      activeDocs.forEach(t => {
          if (existingDocClientIds.has(t.client_id)) return;

          const c = effectiveClients.find(client => client.id === t.client_id);
          let alreadyInCallQueue = false;
          if (c) {
             const isFullyDone = c.exp_completed && c.tu_completed && c.eq_completed;
             alreadyInCallQueue = activeCalls.some(call => call.client_id === c.id);
             if (isFullyDone) return;
          }

          existingDocClientIds.add(t.client_id);
          const d = new Date(t.created_at || new Date());
          d.setDate(d.getDate() + 7);

          formattedTasks.push({
             ...t,
             targetDate: t.targetDate || d.toISOString().split('T')[0],
             alreadyInCallQueue,
             lastDocsSubmitted: lastDocsSubmittedByClient[t.client_id] || null,
             lastCalled: lastCalledByClient[t.client_id] || null,
             clients: c || { full_name: "Unknown Client", exp_completed: false, tu_completed: false, eq_completed: false }
          });
      });

      // B. Create Virtual Tasks — same "don't hide clients already in Call
      // Routing" reasoning as A above: a paid, not-done client with no
      // active document_routing row at all still gets a draft next-round
      // row here even if they're currently mid-call for their current
      // round, so they're never simply absent from this page.
      effectiveClients.forEach(c => {
          if (!c.is_paid) return;

          const isFullyDone = c.exp_completed && c.tu_completed && c.eq_completed;
          const alreadyInCallQueue = activeCalls.some(call => call.client_id === c.id);

          if (!isFullyDone && !existingDocClientIds.has(c.id)) {
              existingDocClientIds.add(c.id);
              const nextRound = (maxRounds[c.id] || 0) + 1;
              const d = new Date();
              d.setDate(d.getDate() + 7);

              formattedTasks.push({
                 id: `virtual-${c.id}`,
                 is_virtual: true,
                 client_id: c.id,
                 round_count: nextRound,
                 status: 'PENDING',
                 ftc_completed: false,
                 cfpb_completed: false,
                 postalocity_completed: false,
                 certified_postalocity_completed: false,
                 exp_submitted: false,
                 tu_submitted: false,
                 eq_submitted: false,
                 assigned_admin_id: c.admin_id || null,
                 targetDate: d.toISOString().split('T')[0],
                 alreadyInCallQueue,
                 lastDocsSubmitted: lastDocsSubmittedByClient[c.id] || null,
                 lastCalled: lastCalledByClient[c.id] || null,
                 clients: c
              });
          }
      });

      // New (no docs started yet — still a Draft/virtual row, no real
      // document_routing entry) sorts before clients already in routing
      // (a real row already exists — docs are underway, even if not
      // finished), so staff can tell at a glance who needs to be started
      // from scratch versus who's already mid-process. targetDate is the
      // tiebreaker within each group, same ordering as before.
      formattedTasks.sort((a, b) => {
          if (a.is_virtual !== b.is_virtual) return a.is_virtual ? -1 : 1;
          return new Date(a.targetDate) - new Date(b.targetDate);
      });
      setTasks(formattedTasks);
      setLoading(false);
    };
    
    fetchData();
  }, [refreshTrigger]);

  // 2. VIRTUAL TASK MATERIALIZER
  const ensureRealTask = async (task) => {
      if (!task.is_virtual) return task.id;
      
      const { data, error } = await supabase.from('document_routing').insert({
          client_id: task.client_id,
          round_count: task.round_count,
          status: 'PENDING',
          assigned_admin_id: task.assigned_admin_id,
          ftc_completed: task.ftc_completed,
          cfpb_completed: task.cfpb_completed,
          postalocity_completed: task.postalocity_completed,
          certified_postalocity_completed: task.certified_postalocity_completed,
          exp_submitted: task.exp_submitted,
          tu_submitted: task.tu_submitted,
          eq_submitted: task.eq_submitted
      }).select().single();
      
      if (error) throw error;
      
      setTasks(prev => prev.map(t => t.id === task.id ? { ...t, ...data, is_virtual: false } : t));
      return data.id;
  };

  const updateTaskLocal = (id, field, value) => {
      setTasks(prev => prev.map(t => t.id === id ? { ...t, [field]: value } : t));
  };

  const saveAssignment = async (task, adminId) => {
      setSavingId(task.id);
      updateTaskLocal(task.id, 'assigned_admin_id', adminId);
      try {
          const realId = await ensureRealTask(task);
          await supabase.from('document_routing').update({ assigned_admin_id: adminId || null }).eq('id', realId);
      } catch (error) {
          addToast({ title: "Assignment Failed", message: "Error assigning admin: " + error.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
      }
      setSavingId(null);
  };

  const toggleCheck = async (task, field) => {
      if (savingId === task.id) return;
      setSavingId(task.id);

      const currentVal = task[field];
      const nextVal = !currentVal;
      updateTaskLocal(task.id, field, nextVal);

      try {
          // Pass the already-flipped value into ensureRealTask, not the
          // stale `task` snapshot — a still-virtual task's very first
          // checkbox toggle materializes the row here, and ensureRealTask's
          // own setTasks() merges its insert response (`data`) back over
          // local state. If that insert were built from the pre-toggle
          // `task` object, `data[field]` would still be the OLD value and
          // this merge would silently clobber the optimistic flip above
          // back to unchecked, even though the DB write below is correct —
          // the checkbox would visually revert right after being checked.
          const realId = await ensureRealTask({ ...task, [field]: nextVal });
          await supabase.from('document_routing').update({ [field]: nextVal }).eq('id', realId);
      } catch (err) {
          updateTaskLocal(task.id, field, currentVal);
          addToast({ title: "Save Failed", message: "Error saving: " + err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
      }
      setSavingId(null);
  };

  // 3. SUBMIT TO CALL ROUTING
  const handleSubmit = async (task) => {
    if (!task.ftc_completed || !task.cfpb_completed) {
        if(!window.confirm("Checklist incomplete. Proceed anyway?")) return;
    }
    setSavingId(task.id);

    try {
        const { data: userData } = await supabase.auth.getUser();

        const bureauSummary = [
            task.exp_submitted ? 'EXP' : '',
            task.tu_submitted ? 'TU' : '',
            task.eq_submitted ? 'EQ' : ''
        ].filter(Boolean).join(', ');

        const logNote = `Round ${task.round_count} Docs Submitted (${bureauSummary || 'None'}). Scheduled for ${task.targetDate}`;
        const realId = await ensureRealTask(task);

        const { error } = await supabase.rpc('process_docs_to_calls', {
            p_doc_task_id: realId,
            p_client_id: task.client_id,
            p_target_date: task.targetDate,
            p_admin_id: userData.user.id,
            p_log_note: logNote,
            p_exp_update: (task.exp_submitted && !task.clients?.exp_completed) ? 'DOCS SUBMITTED' : null,
            p_tu_update: (task.tu_submitted && !task.clients?.tu_completed) ? 'DOCS SUBMITTED' : null,
            p_eq_update: (task.eq_submitted && !task.clients?.eq_completed) ? 'DOCS SUBMITTED' : null
        });

        if (error) throw error;

        setTasks(prev => prev.filter(t => t.id !== task.id));
        addToast({ title: "Submitted", message: "Documents Submitted & Sent to Call Queue", variant: "success", icon: "bi-check-circle-fill" });

    } catch (err) {
        console.error("RPC Error:", err);
        addToast({ title: "Error", message: "Error: " + err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
        setSavingId(null);
    }
  };

  // 👇 NEW: DELETE TASK FROM BOTH QUEUES 👇
  const handleDeleteTask = async (task) => {
    const confirmDelete = window.confirm(
      `Are you sure you want to completely remove ${task.clients?.full_name || 'this client'} from the queues?\n\nThis will delete their active routing tasks and mark their bureaus as completed to stop them from auto-queueing.`
    );
    if (!confirmDelete) return;

    setSavingId(task.id);
    try {
        // 1. Delete from document_routing
        await supabase.from('document_routing').delete().eq('client_id', task.client_id).eq('status', 'PENDING');
        
        // 2. Delete from call_routing
        await supabase.from('call_routing').delete().eq('client_id', task.client_id).eq('status', 'PENDING');

        // 3. Complete the bureaus in the clients table so the Virtual Task logic doesn't instantly pull them back in
        await supabase.from('clients').update({
            exp_completed: true,
            tu_completed: true,
            eq_completed: true
        }).eq('id', task.client_id);

        setRefreshTrigger(prev => prev + 1); // Refresh the UI
    } catch (err) {
        console.error("Delete Error:", err);
        addToast({ title: "Delete Failed", message: "Failed to delete task: " + err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
        setSavingId(null);
    }
  };

  // 4. MANUAL ADD: DROPS A CLIENT BACK INTO THE LOOP
  const handleAddDocTask = async () => {
    if (!newTask.client_id || !newTask.round_count) return addToast({ title: "Missing Fields", message: "Please select a client and round.", variant: "warning", icon: "bi-exclamation-triangle-fill" });

    const isAlreadyInQueue = tasks.some(t => t.client_id === newTask.client_id);
    if (isAlreadyInQueue) {
        return addToast({ title: "Already Queued", message: "This client is already active in the Document Routing queue!", variant: "warning", icon: "bi-exclamation-triangle-fill" });
    }

    setAdding(true);

    const { count: inCalls } = await supabase
        .from('call_routing')
        .select('*', { count: 'exact', head: true })
        .eq('client_id', newTask.client_id)
        .eq('status', 'PENDING');

    if (inCalls > 0) {
        setAdding(false);
        return addToast({ title: "Cannot Add", message: "This client is currently active in the Call Routing queue. They must finish calls first.", variant: "warning", icon: "bi-exclamation-triangle-fill" });
    }

    await supabase.from('clients').update({
        exp_completed: false,
        tu_completed: false,
        eq_completed: false,
        exp_status: 'NEW',
        tu_status: 'NEW',
        eq_status: 'NEW'
    }).eq('id', newTask.client_id);

    const { error } = await supabase.from('document_routing').insert([{
        client_id: newTask.client_id,
        round_count: newTask.round_count,
        assigned_admin_id: newTask.assigned_admin_id || null,
        status: 'PENDING',
        ftc_completed: false,
        cfpb_completed: false,
        postalocity_completed: false,
        certified_postalocity_completed: false,
        exp_submitted: false,
        tu_submitted: false,
        eq_submitted: false
    }]);
    
    setAdding(false);

    if (error) addToast({ title: "Add Failed", message: "Failed to add task: " + error.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    else {
        setShowModal(false);
        setNewTask({ client_id: "", round_count: 1, assigned_admin_id: "" });
        setRefreshTrigger(prev => prev + 1); 
    }
  };

  return (
    <Container fluid className="py-4">
      <div className="d-flex justify-content-between align-items-center mb-4 flex-wrap gap-3">
        <h3 className="mb-0 fw-bold text-primary"><i className="bi bi-file-earmark-text me-2"></i>Document Routing</h3>
        <Button variant="outline-primary" onClick={() => setShowModal(true)}>
            <i className="bi bi-arrow-repeat me-1"></i> Add Client to Loop
        </Button>
      </div>

      {loading ? <Spinner animation="border" /> : roundNumbers.length === 0 ? (
        <Card className="shadow-sm border-0"><Card.Body className="text-center p-4 text-muted">No pending documents.</Card.Body></Card>
      ) : (
        <Card className="shadow-sm border-0">
          <Card.Header className="bg-white pt-3 pb-0 border-bottom-0 d-flex flex-wrap justify-content-between align-items-end gap-2">
            <Nav variant="tabs" activeKey={activeRound} onSelect={(k) => setActiveRound(Number(k))} className="border-bottom-0">
              {roundNumbers.map((r) => (
                <Nav.Item key={r}>
                  <Nav.Link eventKey={r}>
                    Round {r}
                    <Badge bg="secondary" className="ms-2">{roundGroups[r].length}</Badge>
                  </Nav.Link>
                </Nav.Item>
              ))}
            </Nav>
            {/* Optional narrowing, never a hard filter — "All Services"
                always shows every paid client in the round above; picking a
                specific service narrows the same list down to just that
                service's clients when that's useful to look at on its
                own. */}
            <Form.Select
              size="sm"
              className="mb-2"
              style={{ maxWidth: 220 }}
              value={serviceFilter}
              onChange={(e) => setServiceFilter(e.target.value)}
            >
              <option value="all">All Services</option>
              {SERVICES.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </Form.Select>
          </Card.Header>
          <Table responsive hover className="align-middle mb-0">
            <thead className="bg-light">
              <tr>
                <th className="py-3 ps-3">Client</th>
                <th className="py-3 text-center">Round</th>
                <th className="py-3">Doc Admin (You)</th>
                {/* Fixed equal width + a fixed-height flex box around each
                    label — "Cert. Postalocity" wraps to 2 lines while FTC/
                    CFPB/Postalocity are 1 line, which without this made the
                    header row look lopsided and the checkbox columns below
                    uneven widths. Centering each label in the same-height
                    box regardless of wrap keeps all 4 checkboxes lined up
                    the same way underneath. */}
                <th className="py-3 text-center" style={{ width: "92px" }}>
                  <div className="d-flex align-items-center justify-content-center" style={{ minHeight: "32px" }}>FTC</div>
                </th>
                <th className="py-3 text-center" style={{ width: "92px" }}>
                  <div className="d-flex align-items-center justify-content-center" style={{ minHeight: "32px" }}>CFPB</div>
                </th>
                <th className="py-3 text-center" style={{ width: "92px" }}>
                  <div className="d-flex align-items-center justify-content-center" style={{ minHeight: "32px" }}>Postalocity</div>
                </th>
                <th className="py-3 text-center" style={{ width: "92px" }}>
                  <div className="d-flex align-items-center justify-content-center" style={{ minHeight: "32px" }}>Cert. Postalocity</div>
                </th>
                <th className="py-3 text-center table-primary">EXP<div className="fw-normal text-muted" style={{ fontSize: "0.65rem" }}>docs + called</div></th>
                <th className="py-3 text-center table-warning">TU<div className="fw-normal text-muted" style={{ fontSize: "0.65rem" }}>docs + called</div></th>
                <th className="py-3 text-center table-success">EQ<div className="fw-normal text-muted" style={{ fontSize: "0.65rem" }}>docs + called</div></th>
                <th className="py-3">Schedule Call</th>
                <th className="py-3 text-center">Action</th>
              </tr>
            </thead>
            <tbody>
              {visibleTasks.length === 0 ? <tr><td colSpan="12" className="text-center p-4">No pending documents in this round.</td></tr> :
              visibleTasks.map(task => {
                const isExpDone = task.clients?.exp_completed;
                const isTuDone = task.clients?.tu_completed;
                const isEqDone = task.clients?.eq_completed;

                // A draft (virtual) row has no real round yet, so it can't
                // be overdue — only a real, still-PENDING round whose 7-day
                // window has passed without FTC/CFPB/every still-pending
                // bureau's checkbox ever getting checked. A bureau already
                // completed/N-A for this client doesn't need this round's
                // checkbox at all, so it's excluded rather than counted
                // against the round (isExpDone/isTuDone/isEqDone above).
                const isOverdue = !task.is_virtual && task.created_at &&
                    (Date.now() - new Date(task.created_at).getTime() >= SEVEN_DAYS_MS) &&
                    !(
                      task.ftc_completed && task.cfpb_completed &&
                      (isExpDone || task.exp_submitted) &&
                      (isTuDone || task.tu_submitted) &&
                      (isEqDone || task.eq_submitted)
                    );

                return (
                <tr key={task.id} className={isOverdue ? "table-danger" : undefined}>
                  <td className="fw-bold ps-3 text-uppercase">
                      {task.clients?.full_name ? (
                        <Link to={`/clients/${task.client_id}`} className="text-decoration-none text-secondary" title="Open this client's profile">
                          {task.clients.full_name}
                        </Link>
                      ) : (
                        // No matching clients row — an orphaned routing row
                        // left over from a deleted client (see
                        // sql/fix_orphaned_routing_rows.sql), so there's no
                        // profile to link to.
                        <span className="text-secondary" title="This client record no longer exists — run sql/fix_orphaned_routing_rows.sql to clean these up">Unknown</span>
                      )}
                      {task.clients?.is_paused && (
                        <span
                          className="ms-2 badge bg-warning text-dark"
                          style={{fontSize:'0.65rem'}}
                          title="Service is paused for this client — same is_paused flag shown on their profile."
                        >
                          <i className="bi bi-pause-fill me-1"></i>PAUSED
                        </span>
                      )}
                      {task.is_virtual && (
                        <span
                          className="ms-2 badge bg-success"
                          style={{fontSize:'0.65rem'}}
                          title="No docs round started yet for this client — sorts to the top of the list until someone acts on it."
                        >
                          NEW — NO DOCS YET
                        </span>
                      )}
                      {task.alreadyInCallQueue && (
                        <span
                          className="ms-2 badge bg-info text-dark"
                          style={{fontSize:'0.65rem'}}
                          title="This client already has an active Call Routing entry — shown here so they're never missed, but Send is disabled to avoid queuing a duplicate call. Use Call Routing to work this client, or Delete here if this round is no longer needed."
                        >
                          <i className="bi bi-headset me-1"></i>IN CALL ROUTING
                        </span>
                      )}
                      {isOverdue && (
                        <span
                          className="ms-2 badge bg-danger"
                          style={{fontSize:'0.65rem'}}
                          title="Past 7 days and still not fully submitted — this round won't auto-queue a call for any still-pending bureau until FTC, CFPB, and that bureau's checkbox are checked."
                        >
                          <i className="bi bi-exclamation-triangle-fill me-1"></i>OVERDUE
                        </span>
                      )}
                  </td>
                  <td className="text-center"><Badge bg="info">R{task.round_count}</Badge></td>
                  
                  <td style={{width: "200px"}}>
                    <div className="d-flex align-items-center gap-2">
                        <Form.Select 
                            size="sm" 
                            value={task.assigned_admin_id || ""} 
                            className="border-primary"
                            onChange={(e) => saveAssignment(task, e.target.value)}
                        >
                            <option value="">-- Claim Client --</option>
                            {admins.map(a => <option key={a.id} value={a.id}>{a.full_name}</option>)}
                        </Form.Select>
                    </div>
                  </td>

                  {/* Fixed width matching the header cells above + the
                      checkbox itself centered in a flex box — Form.Check's
                      default markup reserves left padding for a label even
                      with none given, which pulls the checkbox off-center
                      under plain text-center. Same fix repeated on all 4
                      so they line up under symmetrical headers. */}
                  <td className="text-center" style={{ width: "92px" }}>
                    <Form.Check
                      className="d-flex justify-content-center"
                      checked={task.ftc_completed}
                      onChange={() =>
                        task.ftc_completed
                          ? toggleCheck(task, 'ftc_completed')
                          : setLogChecklistFor({ task, field: 'ftc_completed', label: 'FTC Complaint' })
                      }
                    />
                  </td>
                  <td className="text-center" style={{ width: "92px" }}>
                    <Form.Check
                      className="d-flex justify-content-center"
                      checked={task.cfpb_completed}
                      onChange={() =>
                        task.cfpb_completed
                          ? toggleCheck(task, 'cfpb_completed')
                          : setLogChecklistFor({ task, field: 'cfpb_completed', label: 'CFPB Complaint' })
                      }
                    />
                  </td>
                  <td className="text-center" style={{ width: "92px" }}>
                    <Form.Check
                      className="d-flex justify-content-center"
                      checked={task.postalocity_completed}
                      onChange={() =>
                        task.postalocity_completed
                          ? toggleCheck(task, 'postalocity_completed')
                          : setLogChecklistFor({ task, field: 'postalocity_completed', label: 'Postalocity' })
                      }
                    />
                  </td>
                  <td className="text-center" style={{ width: "92px" }}>
                    <Form.Check
                      className="d-flex justify-content-center"
                      checked={task.certified_postalocity_completed}
                      onChange={() =>
                        task.certified_postalocity_completed
                          ? toggleCheck(task, 'certified_postalocity_completed')
                          : setLogChecklistFor({ task, field: 'certified_postalocity_completed', label: 'Certified Postalocity' })
                      }
                    />
                  </td>

                  <BureauCell
                      isDone={isExpDone}
                      colorClass="table-primary"
                      checked={task.exp_submitted}
                      onToggle={() => toggleCheck(task, 'exp_submitted')}
                      onLogDocs={() => setLogDocsFor({ task, bureau: 'EXP', field: 'exp_submitted' })}
                      lastDocsSubmitted={task.lastDocsSubmitted?.EXP}
                      lastCalled={task.lastCalled?.EXP}
                  />
                  <BureauCell
                      isDone={isTuDone}
                      colorClass="table-warning"
                      checked={task.tu_submitted}
                      onToggle={() => toggleCheck(task, 'tu_submitted')}
                      onLogDocs={() => setLogDocsFor({ task, bureau: 'TU', field: 'tu_submitted' })}
                      lastDocsSubmitted={task.lastDocsSubmitted?.TU}
                      lastCalled={task.lastCalled?.TU}
                  />
                  <BureauCell
                      isDone={isEqDone}
                      colorClass="table-success"
                      checked={task.eq_submitted}
                      onToggle={() => toggleCheck(task, 'eq_submitted')}
                      onLogDocs={() => setLogDocsFor({ task, bureau: 'EQ', field: 'eq_submitted' })}
                      lastDocsSubmitted={task.lastDocsSubmitted?.EQ}
                      lastCalled={task.lastCalled?.EQ}
                  />

                  <td>
                    <Form.Control type="date" size="sm" value={task.targetDate} onChange={(e) => updateTaskLocal(task.id, 'targetDate', e.target.value)} />
                  </td>
                  
                  {/* 👇 UPDATED ACTION COLUMN WITH DELETE BUTTON 👇 */}
                  <td className="text-center">
                    <div className="d-flex justify-content-center gap-2">
                        <Button
                            size="sm"
                            variant="success"
                            onClick={() => handleSubmit(task)}
                            disabled={savingId === task.id || task.alreadyInCallQueue}
                            title={task.alreadyInCallQueue ? "Already sent — this client has an active Call Routing entry. Sending again would queue a duplicate call." : undefined}
                        >
                            {savingId === task.id ? <Spinner size="sm" animation="border" /> : <><i className="bi bi-arrow-right me-1"></i> Send</>}
                        </Button>
                        <Button size="sm" variant="outline-danger" onClick={() => handleDeleteTask(task)} disabled={savingId === task.id} title="Remove from Queues">
                            <i className="bi bi-trash"></i>
                        </Button>
                    </div>
                  </td>
                </tr>
              )})}
            </tbody>
          </Table>
        </Card>
      )}

      {/* Manual Add / Loop Client Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title><i className="bi bi-arrow-repeat me-2"></i>Loop Client into Docs</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">Select Client <span className="text-danger">*</span></Form.Label>
            <Form.Select 
                value={newTask.client_id}
                onChange={(e) => {
                    const cid = e.target.value;
                    const nextRound = (clientRounds[cid] || 0) + 1;
                    setNewTask({...newTask, client_id: cid, round_count: nextRound});
                }}
            >
                <option value="">-- Search & Choose a Client --</option>
                {clientsList.map(c => <option key={c.id} value={c.id}>{c.full_name}</option>)}
            </Form.Select>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold">Dispute Round <span className="text-danger">*</span></Form.Label>
            <Form.Control 
                type="number" 
                min="1"
                value={newTask.round_count}
                onChange={(e) => setNewTask({...newTask, round_count: parseInt(e.target.value) || 1})}
            />
            <Form.Text className="text-muted small">Auto-filled based on client's history.</Form.Text>
          </Form.Group>

          <Form.Group className="mb-3">
            <Form.Label className="fw-bold text-primary">Assign Doc Admin (Optional)</Form.Label>
            <Form.Select 
                value={newTask.assigned_admin_id}
                onChange={(e) => setNewTask({...newTask, assigned_admin_id: e.target.value})}
            >
                <option value="">-- Unassigned --</option>
                {admins.map(p => <option key={p.id} value={p.id}>{p.full_name}</option>)}
            </Form.Select>
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={() => setShowModal(false)} disabled={adding}>
            Cancel
          </Button>
          <Button variant="primary" onClick={handleAddDocTask} disabled={adding}>
            {adding ? <Spinner size="sm" animation="border" /> : "Save & Add to Queue"}
          </Button>
        </Modal.Footer>
      </Modal>

      {/* Log Document Modal — opened from an EXP/TU/EQ "submitted"
          checkbox above. Fully unmounts when logDocsFor is null so each
          open gets a fresh initialBureaus/state (see LogDocumentModal's own
          useState initializer). */}
      {logDocsFor && (
        <LogDocumentModal
          show={true}
          onClose={() => setLogDocsFor(null)}
          clientId={logDocsFor.task.client_id}
          initialBureaus={{ [logDocsFor.bureau]: true }}
          onLogged={() => toggleCheck(logDocsFor.task, logDocsFor.field)}
        />
      )}

      {/* Log Checklist Item Modal — opened from FTC/CFPB/Postalocity/
          Certified Postalocity "completed" checkboxes above. Posts to the
          client's Activity Thread (comments table) instead of
          document_logs, then flips the checkbox via the same toggleCheck
          used everywhere else in this file. */}
      {logChecklistFor && (
        <LogChecklistItemModal
          show={true}
          onClose={() => setLogChecklistFor(null)}
          clientId={logChecklistFor.task.client_id}
          label={logChecklistFor.label}
          roundCount={logChecklistFor.task.round_count}
          onLogged={() => toggleCheck(logChecklistFor.task, logChecklistFor.field)}
        />
      )}

    </Container>
  );
}