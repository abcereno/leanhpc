import { useState, useMemo } from "react";
import {
  Row,
  Col,
  Modal,
  Button,
  Form,
  Table,
  Spinner,
  Badge,
} from "react-bootstrap";
import useFinancialLogs from "../../hooks/useFinancialLogs";
import { useAuth } from "../../context/AuthContext";
import { dayTS, sumInWeek } from "../../utils/weekRangeSum";
import SearchableSelect from "../shared/ui/SearchableSelect";
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

export default function FinancialDashboard() {
  const { userId } = useAuth();

  const [activeTab, setActiveTab] = useState("dashboard");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [showIncomeModal, setShowIncomeModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);

  const [showBonusModal, setShowBonusModal] = useState(false);
  const [selectedBonusEntry, setSelectedBonusEntry] = useState(null);
  const [showBonusDetailModal, setShowBonusDetailModal] = useState(false);

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

    // state + actions
    loading,
    addIncome,
    addExpense,
    addBonus,
    deleteIncome,
    deleteExpense,
  } = useFinancialLogs(startDate, endDate);

  const [submitting, setSubmitting] = useState(false);

  // ---- Compat shim for charts that used to take `logs`
  const logsCompat = useMemo(() => {
    const inc = (incomes || []).map((r) => ({
      id: r.id,
      date: r.date,
      amount: Number(r.amount || 0),
      log_type: "income",
      category: r.category || null,
      source: r.source || null,
      notes: r.notes || null,
      client_id: r.client_id || null,
      employee_id: r.employee_id || null,
    }));
    const exp = (expenses || []).map((r) => ({
      id: r.id,
      date: r.date,
      amount: Number(r.amount || 0),
      log_type: "expense",
      category: r.category || null,
      notes: r.notes || null,
      vendor: r.vendor || null,
      employee_id: r.employee_id || null,
      company_id: r.company_id || null,
    }));
    return [...inc, ...exp].sort((a, b) => (a.date > b.date ? 1 : -1));
  }, [incomes, expenses]);

  // derived rows for tabs
  const incomeRows = useMemo(() => incomes, [incomes]);
  const expenseRows = useMemo(() => expenses, [expenses]);

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

      {/* Tabs */}
      <ul className="nav nav-tabs mb-4">
        {["dashboard", "income", "payroll", "expenses", "bonuses"].map(
          (tab) => (
            <li className="nav-item" key={tab}>
              <button
                className={`nav-link ${activeTab === tab ? "active" : ""}`}
                onClick={() => setActiveTab(tab)}
              >
                {tab.charAt(0).toUpperCase() + tab.slice(1)}
              </button>
            </li>
          )
        )}
      </ul>

      {/* Dashboard Tab */}
      {activeTab === "dashboard" && (
        <>
          <Row className="mb-4">
            <Col md={3}>
              <h6 className="mb-1 text-muted">Total Income</h6>
              <h4>{money(totalIncome)}</h4>
            </Col>
            <Col md={3}>
              <h6 className="mb-1 text-muted">Total Expenses</h6>
              <h4>{money(totalExpenses)}</h4>
            </Col>
            <Col md={3}>
              <h6 className="mb-1 text-muted">Total Payroll (incl. Bonuses)</h6>
              <h4>{money(totalCompensation)}</h4>
              <small className="text-muted">
                Base: {money(totalPayroll)} • Bonuses: {money(totalBonuses)}
              </small>
            </Col>
            <Col md={3}>
              <h6 className="mb-1 text-muted">Net Profit</h6>
              <h4>
                <Badge bg={netProfit >= 0 ? "success" : "danger"}>
                  {money(netProfit)}
                </Badge>
              </h4>
              <small className="text-muted">Net includes bonuses</small>
            </Col>
          </Row>

          {loading ? (
            <div className="d-flex justify-content-center py-5">
              <Spinner animation="border" />
            </div>
          ) : (
            <>
              <Row className="mt-4 mb-4 d-flex justify-content-center">
                <Col md={6}>
                  <ExpensesChart expenses={expenseRows} logs={logsCompat} />
                </Col>
              </Row>
              <Row>
                <Col md={6}>
                  <IncomeChart
                    totalIncome={totalIncome}
                    totalExpenses={totalExpenses}
                    totalPayroll={totalCompensation} // use payroll + bonuses
                    logs={logsCompat}
                  />
                </Col>
                <Col md={6}>
                  <NetProfitTrend
                    payroll={payroll}
                    incomes={incomeRows}
                    expenses={expenseRows}
                    bonuses={bonuses}
                  />
                </Col>
              </Row>
              <Row className="mt-4">
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
          <Button
            className="mb-3"
            onClick={() => setShowIncomeModal(true)}
            disabled={loading}
          >
            + Add Income
          </Button>
          {loading ? (
            <Spinner animation="border" size="sm" />
          ) : (
            <>
              <IncomeChart
                totalIncome={totalIncome}
                totalExpenses={totalExpenses}
                totalPayroll={totalCompensation} // use payroll + bonuses
                logs={logsCompat}
              />
              <Table striped bordered hover className="mt-3">
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
                  {incomeRows.map((r) => (
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
                      <td>{r.category || "—"}</td>
                      <td>{r.source || "—"}</td>
                      <td>{money(r.amount)}</td>
                      <td>
                        <Button
                          variant="outline-danger"
                          size="sm"
                          onClick={async () => {
                            if (window.confirm("Delete this income entry?")) {
                              await deleteIncome(r.id);
                            }
                          }}
                        >
                          Delete
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </>
          )}
        </>
      )}

      {/* Payroll Tab */}
      {activeTab === "payroll" && (
        <>
          <PayrollChart payroll={payroll} />
          {loading ? (
            <p className="mt-3">Loading…</p>
          ) : payroll.length === 0 ? (
            <p className="mt-3">No payroll records found.</p>
          ) : (
            <Table striped bordered hover className="mt-3">
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
                  return (
                    <tr key={entry.id}>
                      <td>{entry.profiles?.full_name || entry.employee_id}</td>
                      <td>{num(entry.total_hours).toFixed(2)}</td>
                      <td>{money(entry.rate_per_hour)}</td>
                      <td>{money(entry.total_pay)}</td>
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
                                employee_name:
                                  entry.profiles?.full_name ||
                                  entry.employee_id,
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
                      <td>
                        {entry.week_start} / {entry.week_end}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </Table>
          )}
        </>
      )}

      {/* Expenses Tab */}
      {activeTab === "expenses" && (
        <>
          <Button
            className="mb-3"
            onClick={() => setShowExpenseModal(true)}
            disabled={loading}
          >
            + Add Expense
          </Button>

          {loading ? (
            <Spinner animation="border" size="sm" />
          ) : (
            <>
              <ExpensesChart expenses={expenseRows} logs={logsCompat} />

              <Table striped bordered hover className="mt-3">
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
                  {expenseRows.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center text-muted">
                        No expenses found.
                      </td>
                    </tr>
                  ) : (
                    expenseRows.map((r) => (
                      <tr key={r.id}>
                        <td>{r.date}</td>
                        <td>{r.category || "—"}</td>
                        <td>{r.vendor || "—"}</td>
                        <td>{money(r.amount)}</td>
                        <td>{r.notes || "—"}</td>
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
                                window.confirm("Delete this expense entry?")
                              ) {
                                await deleteExpense(r.id);
                              }
                            }}
                          >
                            Delete
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </Table>
            </>
          )}
        </>
      )}

      {/* Bonuses Tab */}
      {activeTab === "bonuses" && (
        <>
          <Button
            className="mb-3"
            onClick={() => setShowBonusModal(true)}
            disabled={loading}
          >
            + Add Bonus
          </Button>
          {bonuses.length === 0 ? (
            <p>No bonus entries found.</p>
          ) : (
            <Table striped bordered hover>
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
                {bonuses.map((bonus) => (
                  <tr key={bonus.id}>
                    <td>{bonus.profiles?.full_name || bonus.employee_id}</td>
                    <td>{money(bonus.bonus_amount)}</td>
                    <td>{bonus.week_start}</td>
                    <td>{bonus.reason}</td>
                    <td>{new Date(bonus.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
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
