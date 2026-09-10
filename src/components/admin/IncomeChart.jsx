import { Card } from "react-bootstrap";
import { Bar } from "react-chartjs-2";

// Chart.js can't resolve this app's CSS custom properties (canvas draws
// with plain hex, not the DOM's computed styles) — these mirror
// index.css's --text-secondary/--border-color/--primary-blue/--accent-red/
// --accent-gold exactly, so the chart's own colors stay in sync with the
// rest of the dark theme instead of drifting from a separately-chosen set
// of hex values. Chart.js's own defaults (near-black axis/legend text)
// were previously used unmodified, which is why this and the sibling
// chart components used to render nearly invisible on this app's dark
// background.
const TEXT_SECONDARY = "#94A3B8";
const GRID_COLOR = "#334155";

export default function IncomeChart({ totalIncome, totalExpenses, totalPayroll }) {
  const data = {
    labels: ["Income", "Expenses", "Payroll"],
    datasets: [
      {
        label: "Amount ($)",
        data: [totalIncome, totalExpenses, totalPayroll],
        backgroundColor: ["#0EA5E9", "#EF4444", "#F59E0B"],
        borderRadius: 4,
        maxBarThickness: 60,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
    },
    scales: {
      x: { ticks: { color: TEXT_SECONDARY }, grid: { display: false } },
      y: { ticks: { color: TEXT_SECONDARY }, grid: { color: GRID_COLOR } },
    },
  };

  return (
    <Card className="border-0 shadow-sm h-100">
      <Card.Body>
        <div className="fw-bold small text-uppercase text-muted mb-3">Income vs Expenses vs Payroll</div>
        <div style={{ position: "relative", width: "100%", height: 260 }}>
          <Bar data={data} options={options} />
        </div>
      </Card.Body>
    </Card>
  );
}
