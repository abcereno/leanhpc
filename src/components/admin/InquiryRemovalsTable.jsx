import { useEffect, useState, useMemo } from "react";
import { Card, Table, Row, Col, Form } from "react-bootstrap";
import { Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import dayjs from "dayjs";
import { supabase } from "../../supabaseClient";

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend
);

export default function InquiryLogViewer() {
  const [logs, setLogs] = useState([]);
  const [filtered, setFiltered] = useState([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [bureau, setBureau] = useState("");
  const [admin, setAdmin] = useState("");

  useEffect(() => {
    const fetchLogs = async () => {
      const { data, error } = await supabase
        .from("inquiry_removals")
        .select("*,clients(full_name), profiles(full_name)")
        .order("saved_at", { ascending: false });
      if (!error) setLogs(data || []);
    };
    fetchLogs();
  }, []);
  useEffect(() => {
    const filteredData = logs.filter((log) => {
      const logDate = dayjs(log.saved_at).format("YYYY-MM-DD");
      const inDateRange =
        (!startDate || logDate >= startDate) &&
        (!endDate || logDate <= endDate);
      const matchesBureau = !bureau || log.bureau === bureau;
      const matchesAdmin = !admin || log.profiles?.full_name === admin;
      return inDateRange && matchesBureau && matchesAdmin;
    });
    setFiltered(filteredData);
  }, [logs, startDate, endDate, bureau, admin]);

  const totalRemoved = filtered.reduce(
    (sum, log) => sum + log.removed_count,
    0
  );

  const groupedTableData = {};
  filtered.forEach((log) => {
    const date = dayjs(log.saved_at).format("YYYY-MM-DD");
    const bureau = log.bureau || "Unknown";
    const admin = log.profiles?.full_name || "Unknown";
    const client = log.clients?.full_name || "Unknown";
    const clientId = log.client_id || "Unknown";
    const adminId = log.admin_id || "Unknown";
    const key = `${date}-${bureau}-${admin}`;
    if (!groupedTableData[key]) {
      groupedTableData[key] = {clientId, adminId, date, bureau, client, admin, count: 0 };
    }
    groupedTableData[key].count += log.removed_count;
  });
  const groupedRows = Object.values(groupedTableData);
  console.log("Grouped Rows:", groupedRows);
  const byBureau = filtered.reduce((acc, log) => {
    acc[log.bureau] = (acc[log.bureau] || 0) + log.removed_count;
    return acc;
  }, {});

  const bureauColors = {
    Experian: "#007bff", // Blue
    TransUnion: "#28a745", // Green
    Equifax: "#dc3545", // Red
    Unknown: "#6c757d", // Gray
  };

  const groupedForChart = {};
  const admins = new Set();
  const allDates = new Set();

  filtered.forEach((log) => {
    const date = dayjs(log.saved_at).format("YYYY-MM-DD");
    const bureau = log.bureau || "Unknown";
    const admin = log.profiles?.full_name || "Unknown";
    admins.add(admin);
    allDates.add(date);

    if (!groupedForChart[date]) groupedForChart[date] = {};
    if (!groupedForChart[date][admin]) groupedForChart[date][admin] = {};
    if (!groupedForChart[date][admin][bureau])
      groupedForChart[date][admin][bureau] = 0;

    groupedForChart[date][admin][bureau] += log.removed_count;
  });

  const labels = Array.from(allDates).sort();

const datasets = useMemo(() => (
  Object.keys(bureauColors).map((bureau) => ({
    label: bureau,
    backgroundColor: bureauColors[bureau],
    data: labels.flatMap((date) => {
      return Array.from(admins).map(
        (admin) => groupedForChart[date]?.[admin]?.[bureau] || 0
      );
    }),
  }))
), [groupedForChart, labels, admins]);

const chartLabels = useMemo(() => (
  labels.flatMap((date) =>
    Array.from(admins).map((admin) => `${date} - ${admin}`)
  )
), [labels, admins]);

  return (
    <>
      <Row className="mb-3">
        <Col md={3}>
          <Form.Control
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
          />
        </Col>
        <Col md={3}>
          <Form.Control
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
          />
        </Col>
        <Col md={3}>
          <Form.Select
            value={bureau}
            onChange={(e) => setBureau(e.target.value)}
          >
            <option value="">All Bureaus</option>
            <option value="Experian">Experian</option>
            <option value="Equifax">Equifax</option>
            <option value="TransUnion">TransUnion</option>
          </Form.Select>
        </Col>
        <Col md={3}>
          <Form.Select value={admin} onChange={(e) => setAdmin(e.target.value)}>
            <option value="">All Admins</option>
            {[...new Set(logs.map((l) => l.profiles?.full_name))]
              .filter(Boolean)
              .map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
          </Form.Select>
        </Col>
      </Row>

      <Row className="mb-3">
        <Col md={3}>
          <Card className="shadow-sm">
            <Card.Body>
              <Card.Title>Total Inquiries Removed</Card.Title>
              <Card.Text style={{ fontSize: "1.5rem", fontWeight: "bold" }}>
                {totalRemoved.toLocaleString()}
              </Card.Text>
            </Card.Body>
          </Card>
        </Col>
        {Object.entries(byBureau).map(([name, count]) => (
          <Col md={3} key={name}>
            <Card className="shadow-sm">
              <Card.Body>
                <Card.Title>{name}</Card.Title>
                <Card.Text style={{ fontWeight: "bold" }}>
                  {count.toLocaleString()}
                </Card.Text>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>

      <Card className="mb-4 shadow-sm">
        <Card.Body>
          <Bar
            data={{ labels: chartLabels, datasets }}
            options={{
              responsive: true,
              plugins: {
                title: {
                  display: true,
                  text: "Inquiries Removed per Day (Side-by-Side by Admin & Bureau)",
                },
                tooltip: {
                  mode: "index",
                  intersect: false,
                },
              },
              interaction: {
                mode: "nearest",
                axis: "x",
                intersect: false,
              },
              scales: {
                x: { stacked: false },
                y: { stacked: false },
              },
            }}
          />
        </Card.Body>
      </Card>

      <Table striped bordered hover>
        <thead>
          <tr>
            <th>Date</th>
            <th>Client</th>
            <th>Bureau</th>
            <th>Admin</th>
            <th>Inquiries Removed</th>
          </tr>
        </thead>
        <tbody>
          {groupedRows.map((row, idx) => (
            <tr key={idx}>
              <td>{dayjs(row.date).format("MM-DD-YYYY")}</td>
              <td>
                <a
                  href={`/clients/${row.clientId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {row.client}
                </a>
              </td>
              <td>{row.bureau}</td>
              <td>
                <a
                  href={`/admin/${row.adminId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {row.admin}
                </a>
              </td>
              <td>{row.count}</td>
            </tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
