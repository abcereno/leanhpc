import { useState, useMemo } from "react";
import {
  Row,
  Col,
  Modal,
  Button,
  Form,
  Table,
  Spinner,
  Card,
  Nav,
  InputGroup,
} from "react-bootstrap";
import useFinancialLogs from "../../hooks/useFinancialLogs";
import { useAuth } from "../../context/AuthContext";
import { dayTS, sumInWeek } from "../../utils/weekRangeSum";
import SearchableSelect from "../shared/ui/SearchableSelect";
import { useConfirm } from "../shared/ui/ConfirmDialog";
import IncomeChart from "./IncomeChart";
import NetProfitTrend from "./NetProfitTrend";
import PayrollChart from "./PayrollChart";
import ExpensesChart from "./ExpensesChart";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  BarElement,
  Title,
  Tooltip,
  Legend
);

// ---- Utils
const money = (v) =>
  new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
  }).format(Number(v || 0));

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Cheap, deterministic string hash — spreads categories across the badge
// palette below without needing a hand-maintained category -> color map
// (categories are free-typed on the Add Income/Expense forms, so a fixed
// map would drift out of date the moment someone types a new one).
function hashString(str) {
  let h = 0;
  const s = String(str || "");
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

// Matches this app's --primary-blue/--accent-gold/--accent-green/
// --accent-red plus two extra accents from letterTemplate.js's purple/
// magenta rotation, so category badges read as part of the same theme
// instead of a separately-invented palette.
const CATEGORY_COLORS = ["#0EA5E9", "#F59E0B", "#10B981", "#7C1FA0", "#C2007F", "#0891B2"];
function categoryColor(category) {
  if (!category) return "#64748B"; // --text-muted, for "Uncategorized"
  return CATEGORY_COLORS[hashString(category) % CATEGORY_COLORS.length];
}

function CategoryBadge({ category }) {
  const color = categoryColor(category);
  return (
    <span
      className="small fw-semibold px-2 py-1"
      style={{ color, backgroundColor: `${color}22`, borderRadius: 6, whiteSpace: "nowrap" }}
    >
      {category || "Uncategorized"}
    </span>
  );
}

function initials(name) {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Avatar({ name }) {
  return (
    <span
      className="d-inline-flex align-items-center justify-content-center me-2 fw-bold"
      style={{
        width: 26,
        height: 26,
        borderRadius: "50%",
        background: "rgba(14, 165, 233, 0.18)",
        color: "#0EA5E9",
        fontSize: "0.65rem",
        verticalAlign: "middle",
      }}
    >
      {initials(name)}
    </span>
  );
}

// Signed percent change, e.g. "+8.2%" / "-3.1%" — null when there's
// nothing to compare against (no previous-period total, or a zero
// baseline that would make a percent meaningless).
function deltaPct(current, previous) {
  if (previous === null || previous === undefined || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

// `goodDirection: "up"` means an increase is favorable (income, net
// profit) — colors green on the way up, red on the way down.
// `goodDirection: "down"` flips that (expenses: less is better).
// `goodDirection: "neutral"` never colors red/green (payroll headcount
// cost isn't inherently good or bad on its own).
function KpiCard({ icon, label, value, previous, goodDirection = "up", sublabel }) {
  const pct = deltaPct(value, previous);
  let deltaColor = "text-muted";
  if (pct !== null && goodDirection !== "neutral") {
    const favorable = goodDirection === "up" ? pct >= 0 : pct <= 0;
    deltaColor = favorable ? "text-success" : "text-danger";
  }
  return (
    <Card className="border-0 shadow-sm h-100">
      <Card.Body>
        <div className="d-flex align-items-center gap-2 mb-2">
          <i className={`bi ${icon} text-secondary`}></i>
          <span className="small text-muted text-uppercase fw-bold">{label}</span>
        </div>
        <div className="fs-4 fw-bold">{money(value)}</div>
        {pct !== null && (
          <div className={`small mt-1 ${deltaColor}`}>
            <i className={`bi ${pct >= 0 ? "bi-arrow-up-right" : "bi-arrow-down-right"} me-1`}></i>
            {Math.abs(pct).toFixed(1)}% vs last period
          </div>
        )}
        {sublabel ? (
          <div className="small text-muted mt-1">{sublabel}</div>
        ) : pct === null ? (
          <div className="small text-muted mt-1">&nbsp;</div>
        ) : null}
      </Card.Body>
    </Card>
  );
}

export default function FinancialDashboard() {
  const { userId } = useAuth();
  const { confirm } = useConfirm();

  const [activeTab, setActiveTab] = useState("dashboard");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  const [showBonusModal, setShowBonusModal] = useState(false);
  const [selectedBonusEntry, setSelectedBonusEntry] = useState(null);
  const [showBonusDetailModal, setShowBonusDetailModal] = useState(false);

  // Income/Expenses tab search + category filter — client-side, over the
  // already-loaded (date-range-filtered) rows, same "narrow what's already
  // fetched" pattern DocumentRouting.jsx's serviceFilter uses.
  const [incomeSearch, setIncomeSearch] = useState("");
  const [incomeCategory, setIncomeCategory] = useState("");
  const [expenseSearch, setExpenseSearch] = useState("");

  const {
    incomes,
    expenses,
    payroll,
    bonuses,
    profiles,
    clients,

    // totals
    totalIncome,
    totalExpenses,
    totalPayroll,
    totalBonuses,
    totalCompensation, // payroll + bonuses
    netProfit,

    // previous-period totals (null unless a date range is selected)
    prevTotalIncome,
    prevTotalExpenses,
    prevTotalCompensation,
    prevNetProfit,

    // state + actions
    loading,
    addIncome,
    addExpense,
    addBonus,
    deleteIncome,
    deleteExpense,
  } = useFinancialLogs(startDate, endDate);

  const [submitting, setSubmitting] = useState(false);

  // derived rows for tabs
  const incomeRows = useMemo(() => incomes, [incomes]);
  const expenseRows = useMemo(() => expenses, [expenses]);

  const incomeCategories = useMemo(
    () => [...new Set((incomes || []).map((r) => r.category).filter(Boolean))].sort(),
    [incomes]
  );

  const filteredIncomeRows = useMemo(() => {
    const q = incomeSearch.trim().toLowerCase();
    return incomeRows.filter((r) => {
      if (incomeCategory && r.category !== incomeCategory) return false;
      if (!q) return true;
      const haystack = `${r.client?.full_name || r.client_name || ""} ${r.source || ""} ${r.notes || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [incomeRows, incomeSearch, incomeCategory]);

  const filteredExpenseRows = useMemo(() => {
    const q = expenseSearch.trim().toLowerCase();
    if (!q) return expenseRows;
    return expenseRows.filter((r) => {
      const haystack = `${r.vendor || ""} ${r.category || ""} ${r.notes || ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [expenseRows, expenseSearch]);

  // Recent Activity feed (Overview tab) — incomes, expenses, and bonuses
  // merged into one reverse-chronological list, capped at 8, so staff can
  // see what just happened across all three without switching tabs. Each
  // source already carries its own `date`/`week_start` — normalized here
  // to a single `date` field for sorting.
  const recentActivity = useMemo(() => {
    const inc = (incomes || []).map((r) => ({
      id: `inc-${r.id}`,
      date: r.date,
      kind: "income",
      title: r.client?.full_name || r.client_name || r.source || "Income",
      subtitle: r.source || r.category || "Income",
      amount: Number(r.amount || 0),
    }));
    const exp = (expenses || []).map((r) => ({
      id: `exp-${r.id}`,
      date: r.date,
      kind: "expense",
      title: r.vendor || r.category || "Expense",
      subtitle: r.category || "Expense",
      amount: -Number(r.amount || 0),
    }));
    const bon = (bonuses || []).map((b) => ({
      id: `bon-${b.id}`,
      date: b.week_start,
      kind: "bonus",
      title: `${b.profiles?.full_name || "Employee"} — bonus`,
      subtitle: b.reason || "Bonus",
      amount: Number(b.bonus_amount || 0),
    }));
    return [...inc, ...exp, ...bon]
      .filter((r) => r.date)
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .slice(0, 8);
  }, [incomes, expenses, bonuses]);

  // Add Income's client picker needs plain { value, label } options
  const clientOptions = useMemo(
    () => (clients || []).map((c) => ({ value: c.id, label: c.full_name || c.id })),
    [clients]
  );

  // ---- Handlers
  const handleAddIncome = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const formData = new FormData(e.target);
      await addIncome({
        client_id: formData.get("client_id"),
        amount: num(formData.get("amount")),
        source: formData.get("source"),
        category: formData.get("category") || null,
        date: formData.get("date"),
        notes: formData.get("notes"),
        employee_id: userId,
      });
      e.target.reset();
      setShowIncomeModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAddExpense = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    try {
      const formData = new FormData(e.target);
      await addExpense({
        category: formData.get("category"),
        vendor: formData.get("vendor") || null,
        amount: num(formData.get("amount")),
        date: formData.get("date"),
        notes: formData.get("notes"),
        employee_id: userId,
      });
      e.target.reset();
      setShowExpenseModal(false);
    } finally {
      setSubmitting(false);
    }
  };

  // Sum bonuses within the payroll week range (inclusive)
  const sumBonusesFor = (employee_id, week_start, week_end) =>
    sumInWeek(
      bonuses.filter((b) => b.employee_id === employee_id),
      { dateKey: "week_start", amountKey: "bonus_amount", weekStart: week_start, weekEnd: week_end }
    );

  // quick presets (optional)
  const setPreset = (days) => {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - (days - 1));
    const iso = (d) => d.toISOString().slice(0, 10);
    setStartDate(iso(start));
    setEndDate(iso(end));
  };

  const TABS = [
    { key: "dashboard", label: "Overview", icon: "bi-speedometer2" },
    { key: "income", label: "Income", icon: "bi-graph-up-arrow" },
    { key: "payroll", label: "Payroll", icon: "bi-people" },
    { key: "expenses", label: "Expenses", icon: "bi-credit-card" },
    { key: "bonuses", label: "Bonuses", icon: "bi-gift" },
  ];

  return (
    <div className="container mt-4">
      {/* Date Filters */}
      <Row className="mb-4 align-items-end">
        <Col md={3}>
          <Form.Label>From:</Form.Label>
          <Form.Control
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Col>
        <Col md={3}>
          <Form.Label>To:</Form.Label>
          <Form.Control
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Col>
        <Col md="auto" className="mt-3 mt-md-0">
          <div className="d-flex gap-2">
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => setPreset(7)}
            >
              Last 7d
            </Button>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => setPreset(30)}
            >
              Last 30d
            </Button>
            <Button
              variant="outline-secondary"
              size="sm"
              onClick={() => {
                setStartDate("");
                setEndDate("");
              }}
            >
              All
            </Button>
          </div>
        </Col>
      </Row>

      {/* KPI Summary Cards — deltas only show once a date range is picked
          (a "previous period" for "All time" isn't a coherent comparison,
          see useFinancialLogs.js's prevTotal* fields). */}
      <Row className="g-3 mb-4">
        <Col xs={6} md={3}>
          <KpiCard icon="bi-arrow-up-right-circle" label="Total Income" value={totalIncome} previous={prevTotalIncome} goodDirection="up" />
        </Col>
        <Col xs={6} md={3}>
          <KpiCard icon="bi-arrow-down-right-circle" label="Total Expenses" value={totalExpenses} previous={prevTotalExpenses} goodDirection="down" />
        </Col>
        <Col xs={6} md={3}>
          <KpiCard
            icon="bi-people"
            label="Payroll + Bonuses"
            value={totalCompensation}
            previous={prevTotalCompensation}
            goodDirection="neutral"
            sublabel={`Base: ${money(totalPayroll)} • Bonuses: ${money(totalBonuses)}`}
          />
        </Col>
        <Col xs={6} md={3}>
          <KpiCard icon="bi-cash-coin" label="Net Profit" value={netProfit} previous={prevNetProfit} goodDirection="up" />
        </Col>
      </Row>

      {/* Tabs */}
      <Nav variant="tabs" className="dark-tabs mb-4" activeKey={activeTab} onSelect={(k) => setActiveTab(k)}>
        {TABS.map((t) => (
          <Nav.Item key={t.key}>
            <Nav.Link eventKey={t.key}>
              <i className={`bi ${t.icon} me-1`}></i>
              {t.label}
            </Nav.Link>
          </Nav.Item>
        ))}
      </Nav>

      {/* Dashboard Tab */}
      {activeTab === "dashboard" && (
        <>
          {loading ? (
            <div className="d-flex justify-content-center py-5">
              <Spinner animation="border" />
            </div>
          ) : (
            <>
              <Row className="g-3 mb-3">
                <Col md={7}>
                  <IncomeChart totalIncome={totalIncome} totalExpenses={totalExpenses} totalPayroll={totalCompensation} />
                </Col>
                <Col md={5}>
                  <ExpensesChart expenses={expenseRows} />
                </Col>
              </Row>
              <Row className="g-3 mb-3">
                <Col md={7}>
                  <NetProfitTrend payroll={payroll} incomes={incomeRows} expenses={expenseRows} bonuses={bonuses} />
                </Col>
                <Col md={5}>
                  <Card className="border-0 shadow-sm h-100">
                    <Card.Body>
                      <div className="fw-bold small text-uppercase text-muted mb-3">Recent Activity</div>
                      {recentActivity.length === 0 ? (
                        <div className="text-muted small text-center py-5">Nothing logged in this range yet.</div>
                      ) : (
                        <div>
                          {recentActivity.map((r) => (
                            <div key={r.id} className="d-flex align-items-center gap-2 py-2 border-bottom border-secondary border-opacity-25">
                              <i
                                className={`bi ${
                                  r.kind === "income" ? "bi-arrow-up-right-circle-fill text-success" :
                                  r.kind === "expense" ? "bi-arrow-down-right-circle-fill text-danger" :
                                  "bi-gift-fill text-warning"
                                }`}
                              ></i>
                              <div className="flex-grow-1" style={{ minWidth: 0 }}>
                                <div className="small fw-semibold text-truncate">{r.title}</div>
                                <div className="small text-muted text-truncate">{r.date} • {r.subtitle}</div>
                              </div>
                              <div className={`small fw-bold ${r.amount >= 0 ? "text-success" : "text-danger"}`}>
                                {r.amount >= 0 ? "+" : "-"}{money(Math.abs(r.amount))}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card.Body>
                  </Card>
                </Col>
              </Row>
              <Row>
                <Col>
                  <PayrollChart payroll={payroll} />
                </Col>
              </Row>
            </>
          )}
        </>
      )}

      {/* Income Tab */}
      {activeTab === "income" && (
        <>
          <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
            <InputGroup style={{ maxWidth: 280 }}>
              <InputGroup.Text><i className="bi bi-search"></i></InputGroup.Text>
              <Form.Control
                placeholder="Search client or source…"
                value={incomeSearch}
                onChange={(e) => setIncomeSearch(e.target.value)}
              />
            </InputGroup>
            <Form.Select style={{ maxWidth: 220 }} value={incomeCategory} onChange={(e) => setIncomeCategory(e.target.value)}>
              <option value="">All categories</option>
              {incomeCategories.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </Form.Select>
            <Button className="ms-auto" onClick={() => setShowIncomeModal(true)} disabled={loading}>
              <i className="bi bi-plus-lg me-1"></i>Add Income
            </Button>
          </div>
          {loading ? (
            <Spinner animation="border" size="sm" />
          ) : (
            <Card className="border-0 shadow-sm">
              <Table hover responsive className="align-middle mb-0">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Client</th>
                    <th>Category</th>
                    <th>Source</th>
                    <th>Amount</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredIncomeRows.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center text-muted py-4">No income entries match this filter.</td>
                    </tr>
                  ) : (
                    filteredIncomeRows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.date}</td>
                        <td>
                          {/* incomes query already embeds client:client_id, so
                              read it directly instead of re-searching the
                              separate `clients` list fetch — one source of
                              truth, and immune to the two queries ever
                              drifting out of sync. */}
                          {r.client?.full_name || r.client_name || "—"}
                        </td>
                        <td><CategoryBadge category={r.category} /></td>
                        <td>{r.source || "—"}</td>
                        <td className="fw-semibold text-success">{money(r.amount)}</td>
                        <td>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={async () => {
                              if (await confirm("Delete this income entry?")) {
                                await deleteIncome(r.id);
                              }
                            }}
                          >
                            <i className="bi bi-trash"></i>
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </Card>
          )}
        </>
      )}

      {/* Payroll Tab */}
      {activeTab === "payroll" && (
        <>
          {loading ? (
            <p className="mt-3">Loading…</p>
          ) : payroll.length === 0 ? (
            <p className="mt-3">No payroll records found.</p>
          ) : (
            <Card className="border-0 shadow-sm">
              <Table hover responsive className="align-middle mb-0">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Total Hours</th>
                    <th>Rate/Hour</th>
                    <th>Total Pay</th>
                    <th>Bonuses</th>
                    <th>Week</th>
                  </tr>
                </thead>
                <tbody>
                  {payroll.map((entry) => {
                    const bonusSum = sumBonusesFor(
                      entry.employee_id,
                      entry.week_start,
                      entry.week_end
                    );
                    const employeeName = entry.profiles?.full_name || entry.employee_id;
                    return (
                      <tr key={entry.id}>
                        <td><Avatar name={employeeName} />{employeeName}</td>
                        <td>{num(entry.total_hours).toFixed(2)}</td>
                        <td>{money(entry.rate_per_hour)}</td>
                        <td className="fw-semibold">{money(entry.total_pay)}</td>
                        <td>
                          <div>
                            <strong>{money(bonusSum)}</strong>
                          </div>
                          <div>
                            <Button
                              variant="link"
                              size="sm"
                              className="p-0 text-muted"
                              style={{ fontSize: "0.8rem" }}
                              onClick={() => {
                                setSelectedBonusEntry({
                                  employee_id: entry.employee_id,
                                  employee_name: employeeName,
                                  week_start: entry.week_start,
                                  week_end: entry.week_end, // include week_end for range filtering
                                });
                                setShowBonusDetailModal(true);
                              }}
                            >
                              view bonuses
                            </Button>
                          </div>
                        </td>
                        <td className="text-muted small">
                          {entry.week_start} / {entry.week_end}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Card>
          )}
        </>
      )}

      {/* Expenses Tab */}
      {activeTab === "expenses" && (
        <>
          <div className="d-flex flex-wrap gap-2 mb-3 align-items-center">
            <InputGroup style={{ maxWidth: 280 }}>
              <InputGroup.Text><i className="bi bi-search"></i></InputGroup.Text>
              <Form.Control
                placeholder="Search vendor or category…"
                value={expenseSearch}
                onChange={(e) => setExpenseSearch(e.target.value)}
              />
            </InputGroup>
            <Button className="ms-auto" onClick={() => setShowExpenseModal(true)} disabled={loading}>
              <i className="bi bi-plus-lg me-1"></i>Add Expense
            </Button>
          </div>

          {loading ? (
            <Spinner animation="border" size="sm" />
          ) : (
            <Card className="border-0 shadow-sm">
              <Table hover responsive className="align-middle mb-0">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Category</th>
                    <th>Vendor</th>
                    <th>Amount</th>
                    <th>Description</th>
                    <th>Logged By</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredExpenseRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center text-muted py-4">
                        {expenseRows.length === 0 ? "No expenses found." : "No expenses match this filter."}
                      </td>
                    </tr>
                  ) : (
                    filteredExpenseRows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.date}</td>
                        <td><CategoryBadge category={r.category} /></td>
                        <td>{r.vendor || "—"}</td>
                        <td className="fw-semibold text-danger">{money(r.amount)}</td>
                        <td className="text-muted small">{r.notes || "—"}</td>
                        <td>
                          {/* expenses query already embeds employee:employee_id,
                              same reasoning as the income row's client column above. */}
                          {r.employee?.full_name || r.employee_id || "—"}
                        </td>
                        <td>
                          <Button
                            variant="outline-danger"
                            size="sm"
                            onClick={async () => {
                              if (
                                await confirm("Delete this expense entry?")
                              ) {
                                await deleteExpense(r.id);
                              }
                            }}
                          >
                            <i className="bi bi-trash"></i>
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </Card>
          )}
        </>
      )}

      {/* Bonuses Tab */}
      {activeTab === "bonuses" && (
        <>
          <div className="mb-3">
            <Button onClick={() => setShowBonusModal(true)} disabled={loading}>
              <i className="bi bi-plus-lg me-1"></i>Add Bonus
            </Button>
          </div>
          {bonuses.length === 0 ? (
            <p>No bonus entries found.</p>
          ) : (
            <Card className="border-0 shadow-sm">
              <Table hover responsive className="align-middle mb-0">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Bonus Amount</th>
                    <th>Week Start</th>
                    <th>Reason</th>
                    <th>Logged</th>
                  </tr>
                </thead>
                <tbody>
                  {bonuses.map((bonus) => {
                    const employeeName = bonus.profiles?.full_name || bonus.employee_id;
                    return (
                      <tr key={bonus.id}>
                        <td><Avatar name={employeeName} />{employeeName}</td>
                        <td className="fw-semibold text-warning">{money(bonus.bonus_amount)}</td>
                        <td>{bonus.week_start}</td>
                        <td className="text-muted small">{bonus.reason}</td>
                        <td className="text-muted small">{new Date(bonus.created_at).toLocaleString()}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </Table>
            </Card>
          )}
        </>
      )}

      {/* Income Modal */}
      <Modal show={showIncomeModal} onHide={() => setShowIncomeModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Add Income</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleAddIncome}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Client</Form.Label>
              <SearchableSelect
                name="client_id"
                options={clientOptions}
                placeholder="Search clients…"
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Amount</Form.Label>
              <Form.Control
                type="number"
                step="0.01"
                min="0"
                name="amount"
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Source</Form.Label>
              <Form.Control
                name="source"
                placeholder="e.g. Partner, Retail, Setup fee"
              />
            </Form.Group>

            {/* optional category */}
            <Form.Group className="mb-3">
              <Form.Label>Category (optional)</Form.Label>
              <Form.Control
                name="category"
                placeholder="e.g. Token Society, Inquiry Processing"
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Date</Form.Label>
              <Form.Control type="date" name="date" required />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Notes</Form.Label>
              <Form.Control as="textarea" name="notes" />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setShowIncomeModal(false)}
              disabled={submitting}
            >
              Close
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Expense Modal */}
      <Modal show={showExpenseModal} onHide={() => setShowExpenseModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Add Expense</Modal.Title>
        </Modal.Header>
        <Form onSubmit={handleAddExpense}>
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Category</Form.Label>
              <Form.Control
                name="category"
                required
                placeholder="e.g. Payroll, Software, Ads"
              />
            </Form.Group>

            {/* optional vendor */}
            <Form.Group className="mb-3">
              <Form.Label>Vendor (optional)</Form.Label>
              <Form.Control
                name="vendor"
                placeholder="e.g. Meta, Supabase, Hubstaff"
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Amount</Form.Label>
              <Form.Control
                type="number"
                step="0.01"
                min="0"
                name="amount"
                required
              />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Date</Form.Label>
              <Form.Control type="date" name="date" required />
            </Form.Group>

            <Form.Group className="mb-3">
              <Form.Label>Description</Form.Label>
              <Form.Control as="textarea" name="notes" />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setShowExpenseModal(false)}
              disabled={submitting}
            >
              Close
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Add Bonus Modal */}
      <Modal show={showBonusModal} onHide={() => setShowBonusModal(false)}>
        <Modal.Header closeButton>
          <Modal.Title>Add Bonus</Modal.Title>
        </Modal.Header>
        <Form
          onSubmit={async (e) => {
            e.preventDefault();
            setSubmitting(true);
            try {
              const formData = new FormData(e.target);
              await addBonus({
                employee_id: formData.get("employee_id"),
                week_start: formData.get("week_start"),
                bonus_amount: num(formData.get("bonus_amount")),
                reason: formData.get("reason"),
              });
              e.target.reset();
              setShowBonusModal(false);
            } finally {
              setSubmitting(false);
            }
          }}
        >
          <Modal.Body>
            <Form.Group className="mb-3">
              <Form.Label>Employee</Form.Label>
              <Form.Select
                name="employee_id"
                required
                defaultValue={userId || ""}
              >
                <option value="" disabled>
                  Select an employee
                </option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                  </option>
                ))}
              </Form.Select>
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Week Start</Form.Label>
              <Form.Control type="date" name="week_start" required />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Bonus Amount</Form.Label>
              <Form.Control
                type="number"
                step="0.01"
                name="bonus_amount"
                required
              />
            </Form.Group>
            <Form.Group className="mb-3">
              <Form.Label>Reason</Form.Label>
              <Form.Control as="textarea" name="reason" />
            </Form.Group>
          </Modal.Body>
          <Modal.Footer>
            <Button
              variant="secondary"
              onClick={() => setShowBonusModal(false)}
              disabled={submitting}
            >
              Close
            </Button>
            <Button type="submit" variant="primary" disabled={submitting}>
              {submitting ? "Saving…" : "Save"}
            </Button>
          </Modal.Footer>
        </Form>
      </Modal>

      {/* Bonus Detail Modal */}
      <Modal
        show={showBonusDetailModal}
        onHide={() => setShowBonusDetailModal(false)}
      >
        <Modal.Header closeButton>
          <Modal.Title>
            Bonuses for {selectedBonusEntry?.employee_name}{" "}
            {selectedBonusEntry ? (
              <small className="text-muted">
                ({selectedBonusEntry.week_start} → {selectedBonusEntry.week_end}
                )
              </small>
            ) : null}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {selectedBonusEntry ? (
            bonuses
              .filter((b) => {
                const sameEmp =
                  b.employee_id === selectedBonusEntry.employee_id;
                const ts = dayTS(b.week_start);
                const s = dayTS(selectedBonusEntry.week_start);
                const e = dayTS(selectedBonusEntry.week_end);
                return (
                  sameEmp &&
                  Number.isFinite(ts) &&
                  Number.isFinite(s) &&
                  Number.isFinite(e) &&
                  ts >= s &&
                  ts <= e
                );
              })
              .map((b) => (
                <div key={b.id} className="mb-2">
                  <strong>{money(b.bonus_amount)}</strong> —{" "}
                  {b.reason || "No reason"} <br />
                  <small className="text-muted">
                    {new Date(b.created_at).toLocaleString()}
                  </small>
                  <hr />
                </div>
              ))
          ) : (
            <p>Loading...</p>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="secondary"
            onClick={() => setShowBonusDetailModal(false)}
          >
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  );
}
