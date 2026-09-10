import { Card } from "react-bootstrap";
import { Bar } from "react-chartjs-2";

// Same dark-theme color constants as IncomeChart.jsx.
const TEXT_SECONDARY = "#94A3B8";
const GRID_COLOR = "#334155";

export default function PayrollChart({ payroll }) {
  const rows = payroll || [];
  const data = {
    labels: rows.map((p) => p.profiles?.full_name || p.employee_id),
    datasets: [
      {
        label: "Total Pay ($)",
        data: rows.map((p) => p.total_pay),
        backgroundColor: "#0EA5E9",
        borderRadius: 4,
        maxBarThickness: 40,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { ticks: { color: TEXT_SECONDARY }, grid: { display: false } },
      y: { ticks: { color: TEXT_SECONDARY }, grid: { color: GRID_COLOR } },
    },
  };

  return (
    <Card className="border-0 shadow-sm h-100">
      <Card.Body>
        <div className="fw-bold small text-uppercase text-muted mb-3">Payroll Distribution</div>
        {rows.length === 0 ? (
          <div className="text-muted small text-center py-5">No payroll records in this range.</div>
        ) : (
          <div style={{ position: "relative", width: "100%", height: 260 }}>
            <Bar data={data} options={options} />
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
