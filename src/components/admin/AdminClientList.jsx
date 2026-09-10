import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import autoAnimate from "@formkit/auto-animate";
import {
  ProgressBar,
  Form,
  Button,
  Badge,
  Tabs,
  Tab,
  Card,
  Alert,
  Modal,
  Collapse
} from "react-bootstrap";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../context/AuthContext";
import AddClientSidebar from "./add-client-sidebar/AddClientSidebar";
import SmartIdiQModal from "./smart-idiq/SmartIdiQModal";
import useAdminClients from "../../hooks/useAdminClients";
import FunderEligibilityModal from "../shared/ui/FunderEligibilityModal";
import InquiryLoader from "../shared/ui/InquiryLoader";
import BulkEditModal from "./client-profile/BulkEditModal";
import ClientSummaryModal from "./client-profile/modals/ClientSummaryModal";
import { SERVICES, serviceLabel } from "../../utils/services";
import ClientProfile from "./ClientProfile";
import { useToast } from "../shared/ui/ToastNotifier";

export default function AdminClientList() {
  const { addToast } = useToast();
  const { isAuthenticated, user, hasPermission } = useAuth();
  // Permission-based scoping (utils/permissions.js): without view_all_clients
  // an employee only sees clients assigned to them. Replaces the old
  // isAdmin/isOwner/role==="subadmin"/role==="callcount" role check.
  const canSeeAllClients = hasPermission("view_all_clients");
  const canManageClients = hasPermission("delete_client");

  const {
    loading,
    pagedClients,
    filteredClientList, 
    totalPages,
    tbodyRef,
    search, setSearch,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    daysFilter, setDaysFilter,
    paidDaysFilter, setPaidDaysFilter,
    companyFilter, setCompanyFilter,
    serviceFilter, setServiceFilter, // 👈 Pulled directly from the optimized hook!
    activeTab, setActiveTab,
    page, setPage, pageSize,
    taskFilter, setTaskFilter,
    agentFilter, setAgentFilter, agentOptions,
    companyOptions,
    sortField, sortDirection, handleSort,
    handleDeleteClient,
    handleTogglePause,
    handleSetPaidAt,
    resetFilters,
  } = useAdminClients();

  // Local Component State
  const [activeClientId, setActiveClientId] = useState(null);
  const [tabCounts, setTabCounts] = useState({ all: 0, paid: 0, unpaid: 0, completed: 0, notCompleted: 0 });
  const [showAddClient, setShowAddClient] = useState(false);
  const [showCountInquiries, setShowCountInquiries] = useState(false);
  const [helpRequests, setHelpRequests] = useState([]);
  const [showHelpModal, setShowHelpModal] = useState(false);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  // useAdminClients now groups same-email clients (one clients row per
  // dispute_round) into a single list entry — one row per person instead of
  // one row per round. This tracks which round each grouped row is
  // currently displaying, keyed by the group's key so switching a
  // dropdown doesn't touch filtering/pagination at all. Defaults to the
  // latest round (last entry in group.rounds, sorted ascending).
  const [selectedRoundByGroup, setSelectedRoundByGroup] = useState({});
  const getActiveClient = (group) => {
    const picked = group.rounds.find((r) => r.id === selectedRoundByGroup[group.key]);
    return picked || group.rounds[group.rounds.length - 1];
  };
  const [showBulkEdit, setShowBulkEdit] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const [summaryClient, setSummaryClient] = useState(null);

  // Paid Modal State
  const [showPaidModal, setShowPaidModal] = useState(false);
  const [paidModalClient, setPaidModalClient] = useState(null);
  const [paidModalDate, setPaidModalDate] = useState("");

  // Eligibility Modal State
  const [showEligibilityModal, setShowEligibilityModal] = useState(false);
  const [eligibilityClient, setEligibilityClient] = useState(null);

  useEffect(() => { if (tbodyRef.current) autoAnimate(tbodyRef.current); }, [tbodyRef]);

  // Tab Counts Fetch
  useEffect(() => {
    const fetchTabCounts = async () => {
      let q = supabase.from("clients").select("id, paid_at, all_completed");
      if (!canSeeAllClients && user?.id) q = q.eq("admin_id", user.id);

      const { data } = await q;
      if (data) {
        setTabCounts({
          all: data.length,
          paid: data.filter((c) => c.paid_at && !c.all_completed).length,
          unpaid: data.filter((c) => !c.paid_at && !c.all_completed).length,
          completed: data.filter((c) => c.all_completed).length,
          notCompleted: data.filter((c) => c.paid_at && !c.all_completed).length,
        });
      }
    };
    fetchTabCounts();
  }, [canSeeAllClients, user?.id, pagedClients]);

  // Help Requests Fetch
  useEffect(() => {
    const fetchRequests = async () => {
      const { data, error } = await supabase
        .from("notifications").select("*, clients(id, full_name, company_id)")
        .eq("type", "admin_help_request").eq("status", "unread").order("created_at", { ascending: false });
      if (!error && data) setHelpRequests(data);
    };
    fetchRequests();
  }, []);

  // Handlers
  const handleOpenSummary = (client) => { setSummaryClient(client); setShowSummary(true); };
  const handleCloseSummary = () => { setShowSummary(false); setSummaryClient(null); };
  const handleOpenEligibility = (client) => { setEligibilityClient(client); setShowEligibilityModal(true); };
  const handleCloseEligibility = () => { setShowEligibilityModal(false); setEligibilityClient(null); };
  const toggleAddClient = () => setShowAddClient((p) => !p);
  const toggleCountinquiries = () => setShowCountInquiries((p) => !p);
  const closePaidModal = () => { setShowPaidModal(false); setPaidModalClient(null); setPaidModalDate(""); };
  
  const openPaidModal = (client) => {
    setPaidModalClient(client);
    const defaultDate = client?.paid_at ? new Date(client.paid_at).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    setPaidModalDate(defaultDate);
    setShowPaidModal(true);
  };
  
  const savePaidDate = async () => {
    if (!paidModalClient || !paidModalDate) return addToast({ title: "Missing Date", message: "Please choose a date", variant: "warning", icon: "bi-exclamation-triangle-fill" });
    const iso = new Date(paidModalDate + "T00:00:00").toISOString();
    await handleSetPaidAt(paidModalClient.id, iso);
    closePaidModal();
  };

  const handleDismissRequest = async (id, targetClientId) => {
    const { error } = await supabase.from("notifications").update({ status: "read" }).eq("id", id);
    if (!error) {
      setHelpRequests((prev) => prev.filter((req) => req.id !== id));
      setShowHelpModal(false);
      if (targetClientId) setActiveClientId(targetClientId);
    }
  };

  const handleSelectAll = (e) => {
    if (e.target.checked) setSelectedIds(new Set(pagedClients.map((g) => getActiveClient(g).id)));
    else setSelectedIds(new Set());
  };

  const handleSelectRow = (id) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  // =======================================================================
  // 1. COMPONENT RENDER BLOCK: TOP HEADER & BUTTONS
  // =======================================================================
  const renderHeader = () => (
    <div className="d-flex flex-wrap justify-content-between align-items-center mb-3 gap-2">
      <div>
        <nav aria-label="breadcrumb" className="mb-1">
          <ol className="breadcrumb small mb-0">
            <li className="breadcrumb-item"><Link to="/admin-dashboard" className="text-decoration-none text-muted">Dashboard</Link></li>
            <li className="breadcrumb-item active fw-bold text-dark" aria-current="page">Client Management</li>
          </ol>
        </nav>
        <h3 className="mb-0 fw-bold text-dark">Client Management</h3>
      </div>
      
      <div className="d-flex gap-2 flex-wrap">
        {selectedIds.size > 0 && (
          <Button variant="warning" onClick={() => setShowBulkEdit(true)} className="fw-bold shadow-sm">
            <i className="bi bi-pencil-square me-2"></i> Edit Selected ({selectedIds.size})
          </Button>
        )}
        <Button variant="primary" onClick={toggleAddClient} className="shadow-sm fw-medium">
          <i className="bi bi-person-plus-fill me-2"></i> Add Client
        </Button>
        <Button variant="outline-warning" onClick={toggleCountinquiries} className="shadow-sm bg-white">
          <i className="bi bi-123 me-2"></i> Count Inquiries
        </Button>
      </div>
    </div>
  );

  // =======================================================================
  // 2. COMPONENT RENDER BLOCK: FILTERS
  // =======================================================================
  const renderFilters = () => (
    <Card className="shadow-sm border-0 mb-3 bg-white">
      <Card.Body className="p-3">
        {/* Main Filter Row */}
        <div className="row g-2 align-items-center">
          <div className="col-12 col-md-4 col-lg-3">
            <div className="input-group" style={{ height: '42px' }}>
              <span className="input-group-text bg-light border-secondary border-end-0 text-muted px-3"><i className="bi bi-search"></i></span>
              <Form.Control
                className="border-secondary border-start-0 ps-0 m-0 p-0 bg-light shadow-none"
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                placeholder="Search clients..."
              />
            </div>
          </div>
          <div className="col-6 col-md-3 col-lg-2">
            <Form.Select style={{ height: '42px' }} value={taskFilter} onChange={(e) => { setTaskFilter(e.target.value); setPage(1); }} className={`border-secondary ${taskFilter === "pending" ? "border-warning text-warning fw-bold" : "bg-light"}`}>
              <option value="all">All Tasks</option>
              <option value="pending">⚠ Action Required</option>
              <option value="resolved">✔ Resolved</option>
            </Form.Select>
          </div>
          <div className="col-6 col-md-3 col-lg-2">
            <Form.Select style={{ height: '42px' }} value={agentFilter} onChange={(e) => { setAgentFilter(e.target.value); setPage(1); }} className="bg-light border-secondary">
              <option value="all">All Agents</option>
              <option value="Unassigned">Unassigned</option>
              {agentOptions.map(name => <option key={name} value={name}>{name}</option>)}
            </Form.Select>
          </div>
          <div className="col-12 col-md-auto ms-auto d-flex gap-2">
            <Button variant="light" onClick={() => setShowAdvancedFilters(!showAdvancedFilters)} className="border text-muted d-flex align-items-center" style={{ height: '42px' }}>
              <i className="bi bi-sliders me-2"></i> {showAdvancedFilters ? "Hide Filters" : "More Filters"}
            </Button>
            <Button variant="outline-danger" onClick={resetFilters} title="Reset all filters" className="d-flex align-items-center" style={{ height: '42px' }}>
              <i className="bi bi-x-lg"></i>
            </Button>
          </div>
        </div>

        {/* Advanced Filters Collapse */}
        <Collapse in={showAdvancedFilters}>
          <div className="mt-3 pt-3 border-top">
            <div className="row g-3">
              <div className="col-6 col-md-3 col-lg-2">
                <Form.Label className="small text-muted mb-1 fw-bold">Company</Form.Label>
                <Form.Select size="sm" value={companyFilter} onChange={(e) => { setCompanyFilter(e.target.value); setPage(1); }}>
                  <option value="all">All Companies</option>
                  {companyOptions.map(name => <option key={name} value={name}>{name}</option>)}
                </Form.Select>
              </div>
              <div className="col-6 col-md-3 col-lg-2">
                <Form.Label className="small text-muted mb-1 fw-bold">Service Type</Form.Label>
                <Form.Select size="sm" value={serviceFilter} onChange={(e) => { setServiceFilter(e.target.value); setPage(1); }}>
                  <option value="all">All Services</option>
                  {SERVICES.map((s) => (
                    <option key={s.id} value={s.id}>{s.label}</option>
                  ))}
                </Form.Select>
              </div>
              <div className="col-6 col-md-3 col-lg-2">
                <Form.Label className="small text-muted mb-1 fw-bold">From Date</Form.Label>
                <Form.Control type="date" size="sm" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPage(1); }} />
              </div>
              <div className="col-6 col-md-3 col-lg-2">
                <Form.Label className="small text-muted mb-1 fw-bold">To Date</Form.Label>
                <Form.Control type="date" size="sm" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPage(1); }} />
              </div>
              <div className="col-6 col-md-3 col-lg-2">
                <Form.Label className="small text-muted mb-1 fw-bold">Days (Unpaid)</Form.Label>
                <Form.Select size="sm" value={daysFilter} onChange={(e) => { setDaysFilter(e.target.value); setPage(1); }}>
                  <option value="all">All</option>
                  <option value="14">14+ days</option>
                  <option value="21">21+ days</option>
                  <option value="28">28+ days</option>
                </Form.Select>
              </div>
              <div className="col-6 col-md-3 col-lg-2">
                <Form.Label className="small text-muted mb-1 fw-bold">Days (Paid)</Form.Label>
                <Form.Select size="sm" value={paidDaysFilter} onChange={(e) => { setPaidDaysFilter(e.target.value); setPage(1); }}>
                  <option value="all">All</option>
                  <option value="lt14">&lt; 14 days</option>
                  <option value="14to20">14–20 days</option>
                  <option value="21to27">21–27 days</option>
                  <option value="28plus">28+ days</option>
                </Form.Select>
              </div>
            </div>
          </div>
        </Collapse>
      </Card.Body>
    </Card>
  );

  // =======================================================================
  // 3. COMPONENT RENDER BLOCK: TABLE & PAGINATION
  // =======================================================================
  // Clickable column header — click sorts by `field` (see useAdminClients.js
  // #handleSort/#sortedClientList), click again reverses direction. Only
  // the active column shows an arrow, so headers don't turn into visual
  // noise on a table this dense.
  const SortableTh = ({ field, children, className = "", style }) => (
    <th
      className={`user-select-none ${className}`}
      style={{ cursor: "pointer", ...style }}
      onClick={() => handleSort(field)}
      title="Click to sort"
    >
      {children}
      {sortField === field && (
        <i className={`bi bi-caret-${sortDirection === "asc" ? "up" : "down"}-fill ms-1`} style={{ fontSize: "0.7rem" }}></i>
      )}
    </th>
  );

  const renderTable = () => (
    <Card className="shadow-sm border-0">
      <Card.Header className="bg-transparent border-0 pt-3 pb-3 d-flex flex-wrap justify-content-between align-items-center gap-3">
        <Tabs activeKey={activeTab} onSelect={(k) => { setActiveTab(k); setPage(1); }} variant="pills" className="gap-2 mb-0 border-0">
          <Tab eventKey="all" title={<div className="d-flex align-items-center"><span className="fw-medium px-1">All Clients</span><Badge bg="secondary" className="ms-2 rounded-pill shadow-sm">{tabCounts.all}</Badge></div>} />
          <Tab eventKey="paid" title={<div className="d-flex align-items-center"><i className="bi bi-currency-dollar text-success me-1"></i><span className="fw-medium px-1">Paid</span><Badge bg="success" className="ms-2 rounded-pill shadow-sm">{tabCounts.paid}</Badge></div>} />
          <Tab eventKey="unpaid" title={<div className="d-flex align-items-center"><i className="bi bi-clock text-warning me-1"></i><span className="fw-medium px-1">Unpaid</span><Badge bg="warning" text="dark" className="ms-2 rounded-pill shadow-sm">{tabCounts.unpaid}</Badge></div>} />
          <Tab eventKey="not_completed" title={<div className="d-flex align-items-center"><i className="bi bi-hourglass-split text-info me-1"></i><span className="fw-medium px-1">Not Completed</span><Badge bg="info" text="dark" className="ms-2 rounded-pill shadow-sm">{tabCounts.notCompleted}</Badge></div>} />
          <Tab eventKey="completed" title={<div className="d-flex align-items-center"><i className="bi bi-check-circle text-primary me-1"></i><span className="fw-medium px-1">Completed</span><Badge bg="primary" className="ms-2 rounded-pill shadow-sm">{tabCounts.completed}</Badge></div>} />
        </Tabs>

        <div className="text-muted small fw-bold bg-light px-3 py-2 rounded shadow-sm border border-secondary border-opacity-25">
           <i className="bi bi-funnel-fill me-2 text-primary"></i>Showing {filteredClientList.length} Results
        </div>
      </Card.Header>
      
      <div className="table-responsive">
        <table className="table table-hover align-middle mb-0" style={{ fontSize: '0.9rem' }}>
          <thead className="table-light align-middle text-muted small text-uppercase">
            <tr>
              <th className="text-center" style={{ width: "40px" }}><Form.Check type="checkbox" onChange={handleSelectAll} checked={pagedClients.length > 0 && selectedIds.size === pagedClients.length} /></th>
              <th className="text-center" style={{ width: "50px" }}>#</th>
              <SortableTh field="name">Client Profile</SortableTh>
              <th>Next Step</th>
              <SortableTh field="company">Company</SortableTh>
              <SortableTh field="agent">Agent</SortableTh>
              <SortableTh field="progress" style={{ minWidth: "120px" }}>Progress</SortableTh>
              <SortableTh field="duration" className="text-center">Duration</SortableTh>
              <th className="text-end pe-4">Actions</th>
            </tr>
          </thead>
          <tbody ref={tbodyRef}>
            {pagedClients.length === 0 ? (
              <tr>
                <td colSpan="9" className="text-center py-5 text-muted">
                  <i className="bi bi-folder2-open display-6 d-block mb-3 opacity-50"></i>
                  No clients found matching your filters.
                </td>
              </tr>
            ) : (
              pagedClients.map((group, index) => {
                const client = getActiveClient(group);

                // Both already come from useAdminClients.js's enrichRows —
                // business days only (calculateBusinessDays excludes
                // weekends and company_holidays), same as before. Switched
                // from recomputing inline here because the inline version
                // didn't freeze while a client was paused, unlike
                // paidRunningDays (dateHelpers.js#calculatePaidRunningDays)
                // — a paused client's Active day count, row color, and sort
                // order kept climbing right along with active files instead
                // of holding still, undercutting the whole point of pausing.
                const unpaidBizDays = client.createdRunningDays ?? 0;
                const paidBizDays = client.paid_at ? (client.paidRunningDays ?? 0) : null;

                // Aging Colors (14 = Yellow, 21 = Orange, 28 = Red, Completed = Green)
                let rowClass = "";
                if (client.all_completed) rowClass = "table-green";
                else if (paidBizDays !== null) {
                  if (paidBizDays >= 28) rowClass = "table-red";
                  else if (paidBizDays >= 21) rowClass = "table-orange";
                  else if (paidBizDays >= 14) rowClass = "table-yellow";
                }
                if (selectedIds.has(client.id)) rowClass += " bg-primary bg-opacity-10";

                return (
                  <tr key={group.key} className={rowClass}>
                    <td className="text-center"><Form.Check type="checkbox" checked={selectedIds.has(client.id)} onChange={() => handleSelectRow(client.id)} /></td>
                    <td className="text-center text-muted fw-medium">{(page - 1) * pageSize + index + 1}</td>
                    <td>
                      <div className="d-flex align-items-center flex-wrap gap-2">
                        <button
                          onClick={() => { if (window.getSelection().toString().length === 0) setActiveClientId(client.id); }}
                          className="btn btn-link p-0 fw-bold text-dark text-decoration-none d-flex align-items-center text-start"
                          style={{ userSelect: 'text' }}
                        >
                          <div className="bg-light text-primary rounded-circle d-flex align-items-center justify-content-center me-2 border flex-shrink-0" style={{ width: '32px', height: '32px', userSelect: 'none' }}>
                              <i className="bi bi-person-fill"></i>
                          </div>
                          <span style={{ cursor: 'text' }}>{client.full_name}</span>
                        </button>
                        {group.rounds.length > 1 ? (
                          <Form.Select
                            size="sm"
                            className="w-auto d-inline-block shadow-sm"
                            style={{ fontSize: '0.75rem', padding: '2px 24px 2px 8px' }}
                            value={client.id}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setSelectedRoundByGroup((prev) => ({ ...prev, [group.key]: e.target.value }))}
                          >
                            {group.rounds.map((r) => (
                              <option key={r.id} value={r.id}>
                                Round {r.dispute_round || 1}{r.id === group.rounds[group.rounds.length - 1].id ? " (current)" : ""}
                              </option>
                            ))}
                          </Form.Select>
                        ) : (
                          client.dispute_round > 1 && <Badge bg="info" text="dark" className="shadow-sm" style={{fontSize: '0.65rem'}}><i className="bi bi-arrow-repeat"></i> ROUND {client.dispute_round}</Badge>
                        )}
                        {client.is_paid && <Badge bg="success" className="shadow-sm" style={{fontSize: '0.65rem'}}><i className="bi bi-currency-dollar"></i> PAID</Badge>}
                        {client.is_paused && <Badge bg="warning" text="dark" className="shadow-sm" style={{fontSize: '0.65rem'}}><i className="bi bi-pause-fill"></i> PAUSED</Badge>}
                        {client.is_paid && client.hasDocIssue && !client.date_completed && (
                          <Badge bg="warning" text="dark" className="shadow-sm" style={{fontSize: '0.65rem'}} title="AI check flagged a document (license, SSN card, or POA) as expired, invalid, or needing review">
                            <i className="bi bi-file-earmark-excel-fill"></i> DOC ISSUE
                          </Badge>
                        )}
                      </div>
                      <div className="small text-muted mt-1 ms-5">
                        {serviceLabel(client, "—")} • {client.counter || "—"} • {client.start_inquiries || "—"}
                      </div>
                    </td>
                    <td>
                      {client.nextStepTag && (
                        <Badge
                          bg={client.nextStepTag.variant}
                          text={client.nextStepTag.textDark ? "dark" : undefined}
                          className="shadow-sm"
                          style={{ fontSize: "0.7rem", whiteSpace: "normal" }}
                        >
                          <i className={`bi ${client.nextStepTag.icon} me-1`}></i>
                          {client.nextStepTag.label}
                        </Badge>
                      )}
                    </td>
                    <td className="text-muted fw-medium">{client.companies?.company_name || "—"}</td>
                    <td>
                      {client.profiles ? (
                        <Link to={`/admin/${encodeURIComponent(client.admin_id)}`} className="text-decoration-none text-info fw-medium small">{client.profiles.full_name}</Link>
                      ) : <span className="text-muted small">—</span>}
                    </td>
                    <td>
                      <div className="d-flex align-items-center gap-2">
                          <ProgressBar now={client.progress} variant={client.progress >= 75 ? "success" : "warning"} className="flex-grow-1" style={{height: '6px', backgroundColor: 'rgba(0,0,0,0.1)'}} />
                          <span className="small fw-bold text-muted" style={{width: '35px'}}>{client.progress}%</span>
                      </div>
                    </td>
                    <td className="text-center">
                      <div className="d-flex justify-content-center gap-3 small">
                        <div className={client.is_paused && !client.is_paid ? "text-warning fw-bold" : "text-muted"}>
                          <span className="d-block" style={{fontSize: '0.7rem'}}>{client.paid_at ? "Setup" : "Unpaid"}</span>
                          {client.is_paused && !client.is_paid && "⏸ "}{unpaidBizDays}d
                        </div>
                        {client.paid_at && (
                          <div className={client.is_paused && client.is_paid ? "text-warning fw-bold" : "text-dark fw-medium"}>
                            <span className="d-block text-muted" style={{fontSize: '0.7rem'}}>Active</span>
                            {client.is_paused && client.is_paid && "⏸ "}{paidBizDays}d
                          </div>
                        )}
                      </div>
                    </td>
                    <td className="text-end pe-4">
                      <div className="d-flex justify-content-end align-items-center gap-2">
                        <button className="btn btn-sm btn-dark border-secondary text-success shadow-sm hover-lift" title="Check Funding Eligibility" onClick={() => handleOpenEligibility(client)}>
                          <i className="bi bi-bank2"></i>
                        </button>
                        {hasPermission("edit_client") && client.is_paid && (
                          <>
                              <button className={`btn btn-sm shadow-sm hover-lift ${client.is_paused ? "btn-warning text-dark border-warning" : "btn-dark border-secondary text-warning"}`} onClick={() => handleTogglePause(client.id)} title={client.is_paused ? "Resume service" : "Pause service"}>
                                <i className={`bi bi-${client.is_paused ? 'play' : 'pause'}-fill`}></i>
                              </button>
                              <button className="btn btn-sm btn-dark border-secondary text-primary shadow-sm hover-lift" title="Edit paid date" onClick={() => openPaidModal(client)}>
                                <i className="bi bi-calendar-event"></i>
                              </button>
                          </>
                        )}
                        <button className="btn btn-sm btn-dark border-secondary text-light shadow-sm hover-lift" onClick={() => handleOpenSummary(client)} title="View Summary">
                          <i className="bi bi-card-list"></i>
                        </button>
                        {canManageClients && (
                          <button className="btn btn-sm btn-dark border-secondary text-danger shadow-sm hover-lift" onClick={() => handleDeleteClient(client.id, canManageClients)} title="Delete client">
                            <i className="bi bi-trash"></i>
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="d-flex justify-content-between align-items-center p-3 border-top bg-light rounded-bottom">
        <Button variant="white" className="border shadow-sm text-muted fw-bold" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
          <i className="bi bi-chevron-left me-1"></i> Prev
        </Button>
        <span className="small fw-bold text-muted">
          Page {page} of {Math.max(1, Math.ceil(filteredClientList.length / pageSize))}
        </span>
        <Button variant="white" className="border shadow-sm text-muted fw-bold" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
          Next <i className="bi bi-chevron-right ms-1"></i>
        </Button>
      </div>
    </Card>
  );

  // =======================================================================
  // 4. MAIN RETURN
  // =======================================================================

  if (!isAuthenticated) return <p className="text-center mt-5">❌ You must be logged in.</p>;
  if (!hasPermission("view_clients")) return <p className="text-center mt-5">🚫 Unauthorized access.</p>;
  if (loading) return <div className="d-flex justify-content-center align-items-center vh-100"><InquiryLoader /></div>;

  if (activeClientId) {
    return (
      <div className="animate-fade-in pb-5">
        <Button variant="primary" className="border shadow-sm fw-bold py-1 px-4 my-3" onClick={() => setActiveClientId(null)}>
          <i className="bi bi-arrow-left me-2"></i> Back
        </Button>
        <ClientProfile overrideId={activeClientId} />
      </div>
    );
  }

  return (
    <div className="container-fluid py-2">
      {/* Urgent Notifications */}
      {helpRequests.length > 0 && (
        <Alert variant="danger" className="d-flex justify-content-between align-items-center shadow-sm py-2 px-3 mb-3 border-danger">
          <div className="fw-bold"><i className="bi bi-exclamation-triangle-fill me-2 fs-5 align-middle"></i> You have {helpRequests.length} urgent help request{helpRequests.length > 1 ? 's' : ''} pending.</div>
          <Button variant="danger" size="sm" className="fw-bold px-3" onClick={() => setShowHelpModal(true)}>View Requests</Button>
        </Alert>
      )}

      {renderHeader()}
      {renderFilters()}
      {renderTable()}

      {/* MODALS */}
      <Modal show={showHelpModal} onHide={() => setShowHelpModal(false)} centered size="lg">
        <Modal.Header closeButton className="bg-danger text-white border-0"><Modal.Title className="fw-bold"><i className="bi bi-bell-fill me-2"></i>Urgent Help Requests</Modal.Title></Modal.Header>
        <Modal.Body className="bg-light p-4">
          {helpRequests.length === 0 ? (
            <div className="text-center text-muted py-4"><i className="bi bi-check-circle fs-1 text-success d-block mb-2"></i> All caught up!</div>
          ) : (
            <div className="d-flex flex-column gap-3">
              {helpRequests.map((req) => (
                <div key={req.id} className="bg-white p-3 rounded shadow-sm border border-danger border-opacity-25 d-flex justify-content-between align-items-center">
                  <div>
                    <h6 className="fw-bold mb-1 text-danger">{req.clients?.full_name || "Unknown Client"}</h6>
                    <p className="mb-1 text-dark">{req.message}</p>
                    <small className="text-muted"><i className="bi bi-clock me-1"></i>{new Date(req.created_at).toLocaleString()}</small>
                  </div>
                  <Button variant="outline-danger" size="sm" onClick={() => handleDismissRequest(req.id, req.clients?.id)} className="fw-bold px-3">Resolve & View</Button>
                </div>
              ))}
            </div>
          )}
        </Modal.Body>
      </Modal>

      <Modal show={showAddClient} onHide={() => setShowAddClient(false)} dialogClassName="modal-90w right-side-modal" contentClassName="h-100" animation={true}>
        <Modal.Header closeButton className="bg-light border-bottom-0 pb-2"><Modal.Title className="fw-bold"><i className="bi bi-person-plus-fill text-primary me-2"></i>Add New Client</Modal.Title></Modal.Header>
        <Modal.Body className="p-0 bg-white overflow-auto"><AddClientSidebar isOpen={showAddClient} onClose={() => setShowAddClient(false)} /></Modal.Body>
      </Modal>

      {showCountInquiries && <SmartIdiQModal show={showCountInquiries} onClose={() => setShowCountInquiries(false)} />}
      <BulkEditModal show={showBulkEdit} onClose={() => setShowBulkEdit(false)} selectedIds={Array.from(selectedIds)} onSaved={() => { setSelectedIds(new Set()); resetFilters(); }} />
      {/* showGapReasons=true here only — this modal is also rendered from
          the company/broker portals' client lists, where Operational
          Timeline gap reasons (internal delay context) shouldn't be
          visible. See ClientSummaryModal.jsx's showGapReasons doc comment. */}
      <ClientSummaryModal show={showSummary} onClose={handleCloseSummary} client={summaryClient} showGapReasons />
      <FunderEligibilityModal show={showEligibilityModal} onHide={handleCloseEligibility} client={eligibilityClient} />

      <Modal show={showPaidModal} onHide={closePaidModal} centered size="sm">
        <Modal.Header closeButton className="border-0 pb-0"><Modal.Title className="h6 fw-bold">Edit Paid Date</Modal.Title></Modal.Header>
        <Modal.Body>
          <Form.Group>
            <Form.Label className="small fw-bold text-muted">Select new date</Form.Label>
            <Form.Control type="date" value={paidModalDate} onChange={(e) => setPaidModalDate(e.target.value)} size="sm" />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer className="border-0 bg-light">
          <Button variant="link" className="text-muted text-decoration-none" onClick={closePaidModal}>Cancel</Button>
          <Button variant="primary" className="fw-bold px-3 shadow-sm" onClick={savePaidDate}>Save</Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}