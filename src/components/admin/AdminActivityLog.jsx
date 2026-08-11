import { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { Table, Spinner, Alert, Container } from "react-bootstrap";
import { Link } from "react-router-dom";

export default function AdminActivityLog() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedDate, setSelectedDate] = useState("");

  // ---------- helpers: parsing ----------
  const safeParseJSON = (val, fallback) => {
    if (val == null) return fallback;
    if (Array.isArray(val)) return val;
    if (typeof val === "string") {
      try { const parsed = JSON.parse(val); return Array.isArray(parsed) ? parsed : fallback; }
      catch { return fallback; }
    }
    return fallback;
  };

  // time "HH:MM:SS" -> seconds
  const timeToSeconds = (t) => {
    if (!t || typeof t !== "string") return null;
    const parts = t.split(":").map(Number);
    if (parts.length < 2) return null;
    const [h=0,m=0,s=0] = parts;
    return (h*3600)+(m*60)+(s||0);
  };

  const formatTime = (t) => t || "—";

  const formatDuration = (seconds) => {
    if (seconds == null || seconds < 0) return "—";
    const h = Math.floor(seconds / 3600).toString().padStart(2, "0");
    const m = Math.floor((seconds % 3600) / 60).toString().padStart(2, "0");
    const s = Math.floor(seconds % 60).toString().padStart(2, "0");
    return `${h}:${m}:${s}`;
  };

  // Pair login/logout arrays by index, ignore incomplete trailing logout
  const pairSessions = (loginArr, logoutArr) => {
    const pairs = [];
    const n = Math.max(loginArr.length, logoutArr.length);
    for (let i = 0; i < n; i++) {
      const login = loginArr[i] ?? null;
      const logout = logoutArr[i] ?? null;
      if (login && logout) pairs.push({ login, logout });
    }
    return pairs;
  };

  const sumShiftSeconds = (loginArr, logoutArr) => {
    const pairs = pairSessions(loginArr, logoutArr);
    return pairs.reduce((sum, p) => {
      const a = timeToSeconds(p.login);
      const b = timeToSeconds(p.logout);
      if (a != null && b != null && b >= a) return sum + (b - a);
      return sum;
    }, 0);
  };

  const sumBreakSeconds = (breaksArr) => {
    return (breaksArr || []).reduce((sum, b) => {
      const a = timeToSeconds(b?.start);
      const c = timeToSeconds(b?.end);
      if (a != null && c != null && c >= a) return sum + (c - a);
      return sum;
    }, 0);
  };

  // row state class (for row highlighting if you add CSS)
  const getRowClass = (log) => {
    const loginArr = safeParseJSON(log.login_times, []);
    const logoutArr = safeParseJSON(log.logout_times, []);
    const breaksArr = safeParseJSON(log.breaks, []);

    const lastLogin = loginArr[loginArr.length - 1];
    const lastLogout = logoutArr[logoutArr.length - 1];

    const isLoggedIn = !!lastLogin && (!lastLogout || timeToSeconds(lastLogout) < timeToSeconds(lastLogin));
    const isLoggedOut = !!lastLogin && !!lastLogout && timeToSeconds(lastLogout) >= timeToSeconds(lastLogin);

    const hasOpenBreak = breaksArr.some(b => b?.start && !b?.end);
    const allBreaksClosed = breaksArr.length > 0 && breaksArr.every(b => b?.start && b?.end);

    if (isLoggedIn && hasOpenBreak) return "on-break";
    if (isLoggedIn && allBreaksClosed) return "back-from-break";
    if (isLoggedOut) return "logged-out";
    if (isLoggedIn) return "logged-in";
    return "";
  };

  // compute durations/summary fields for a row
  const computeRow = (raw) => {
    const breaksArr = safeParseJSON(raw.breaks, []);
    const loginArr = safeParseJSON(raw.login_times, []);
    const logoutArr = safeParseJSON(raw.logout_times, []);

    const totalShiftSec = sumShiftSeconds(loginArr, logoutArr);
    const totalBreakSec = sumBreakSeconds(breaksArr);
    const netWorkSec = Math.max(0, totalShiftSec - totalBreakSec);

    // presentation: earliest login / latest logout
    const firstLogin = loginArr.length ? loginArr[0] : null;
    const lastLogout = logoutArr.length ? logoutArr[logoutArr.length - 1] : null;

    return {
      ...raw,
      breaksArr,
      loginArr,
      logoutArr,
      firstLogin,
      lastLogout,
      shiftDuration: formatDuration(totalShiftSec),
      breakDuration: formatDuration(totalBreakSec),
      netWorkDuration: formatDuration(netWorkSec),
    };
  };

  useEffect(() => {
    const fetchLogs = async () => {
      setLoading(true);
      const { data, error: err } = await supabase
        .from("employee_logs")
        .select("id, employee_id, log_date, breaks, login_times, logout_times, profiles:profiles!employee_logs_employee_id_fkey(full_name)")
        .order("log_date", { ascending: false });

      if (err) {
        setError(err.message || "Failed to load logs");
        setLoading(false);
        return;
      }

      const parsed = (data || []).map(computeRow);
      setLogs(parsed);
      setLoading(false);
    };

    fetchLogs();
  }, []);

  if (loading) {
    return (
      <Container className="mt-5 text-center">
        <Spinner animation="border" />
        <p>Loading activity logs...</p>
      </Container>
    );
  }

  if (error) {
    return (
      <Container className="mt-4">
        <Alert variant="danger">
          <Alert.Heading>Error</Alert.Heading>
          <p>{error}</p>
        </Alert>
      </Container>
    );
  }

  // filter by selected date (YYYY-MM-DD)
  const filtered = logs.filter((log) => {
    if (!selectedDate) return true;
    return log.log_date === selectedDate;
  });

  return (
    <Container className="mt-4">
      <h4 className="mb-3">⏱ Employee Activity Log</h4>

      <div className="mb-3 d-flex align-items-center gap-2">
        <label htmlFor="dateFilter" className="form-label mb-0">Filter by Date:</label>
        <input
          type="date"
          id="dateFilter"
          className="form-control"
          style={{ maxWidth: "200px" }}
          value={selectedDate}
          onChange={(e) => setSelectedDate(e.target.value)}
        />
      </div>

      <Table striped bordered hover responsive>
        <thead>
          <tr>
            <th>Employee</th>
            <th>Date</th>
            <th>First Login</th>
            <th>Last Logout</th>
            <th>Total Shift</th>
            <th>Total Breaks</th>
            <th>Net Work</th>
          </tr>
        </thead>
        <tbody>
          {filtered.map((log) => (
            <tr key={log.id} className={getRowClass(log)}>
              <td>
                <Link to={`/admin/${log.employee_id}`} className="text-decoration-none">
                  {log.profiles?.full_name || "—"}
                </Link>
              </td>
              <td>{log.log_date}</td>
              <td>{formatTime(log.firstLogin)}</td>
              <td>{formatTime(log.lastLogout)}</td>
              <td>{log.shiftDuration}</td>
              <td>{log.breakDuration}</td>
              <td>{log.netWorkDuration}</td>
            </tr>
          ))}
          {filtered.length === 0 && (
            <tr>
              <td colSpan={7} className="text-center text-muted py-4">No logs for the selected date.</td>
            </tr>
          )}
        </tbody>
      </Table>
    </Container>
  );
}
