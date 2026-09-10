import { Card } from "react-bootstrap";
import { Pie } from "react-chartjs-2";

// Same dark-theme color constants as IncomeChart.jsx — see that file's
// comment for why these are hardcoded hex rather than CSS variables.
const TEXT_SECONDARY = "#94A3B8";
const BG_CARD = "#151E32";

const SLICE_COLORS = ["#0EA5E9", "#F59E0B", "#EF4444", "#10B981", "#7C1FA0", "#C2007F"];

export default function ExpensesChart({ expenses }) {
  const categoryTotals = (expenses || []).reduce((acc, e) => {
    const key = e.category || "Uncategorized";
    acc[key] = (acc[key] || 0) + Number(e.amount || 0);
    return acc;
  }, {});

  const labels = Object.keys(categoryTotals);
  const data = {
    labels,
    datasets: [
      {
        label: "Expenses by Category",
        data: Object.values(categoryTotals),
        backgroundColor: labels.map((_, i) => SLICE_COLORS[i % SLICE_COLORS.length]),
        borderColor: BG_CARD,
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { position: "bottom", labels: { color: TEXT_SECONDARY, boxWidth: 12, padding: 12 } },
    },
  };

  return (
    <Card className="border-0 shadow-sm h-100">
      <Card.Body>
        <div className="fw-bold small text-uppercase text-muted mb-3">Expenses Breakdown</div>
        {labels.length === 0 ? (
          <div className="text-muted small text-center py-5">No expenses in this range.</div>
        ) : (
          <div style={{ position: "relative", width: "100%", height: 260 }}>
            <Pie data={data} options={options} />
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
