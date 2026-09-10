import { Card } from "react-bootstrap";
import { Line } from "react-chartjs-2";
import { sumInWeek } from "../../utils/weekRangeSum";

// Same dark-theme color constants as IncomeChart.jsx.
const TEXT_SECONDARY = "#94A3B8";
const GRID_COLOR = "#334155";

// Net profit per payroll week = income in that week - expenses in that
// week - that week's payroll - that week's bonuses.
//
// This used to plot totalIncome - totalExpenses - p.total_pay for every
// week, where totalIncome/totalExpenses were the SAME fixed totals across
// the entire selected date range — so the line only ever moved because of
// payroll, not because of any real income/expense change week to week.
// Bucketing incomes/expenses/bonuses into each payroll's own
// [week_start, week_end] range (same helper used for the payroll table's
// bonus column) makes this an actual trend.
export default function NetProfitTrend({ payroll, incomes = [], expenses = [], bonuses = [] }) {
  const rows = payroll || [];
  const points = rows.map((p) => {
    const weekIncome = sumInWeek(incomes, { weekStart: p.week_start, weekEnd: p.week_end });
    const weekExpenses = sumInWeek(expenses, { weekStart: p.week_start, weekEnd: p.week_end });
    const weekBonuses = sumInWeek(bonuses, {
      dateKey: "week_start",
      amountKey: "bonus_amount",
      weekStart: p.week_start,
      weekEnd: p.week_end,
    });
    return weekIncome - weekExpenses - Number(p.total_pay || 0) - weekBonuses;
  });

  const data = {
    labels: rows.map((p) => `${p.week_start} - ${p.week_end}`),
    datasets: [
      {
        label: "Net Profit",
        data: points,
        borderColor: "#10B981",
        backgroundColor: "rgba(16, 185, 129, 0.15)",
        fill: true,
        tension: 0.3,
        pointRadius: 3,
        pointBackgroundColor: "#10B981",
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
        <div className="fw-bold small text-uppercase text-muted mb-3">Net Profit Trend</div>
        {rows.length === 0 ? (
          <div className="text-muted small text-center py-5">No payroll weeks in this range.</div>
        ) : (
          <div style={{ position: "relative", width: "100%", height: 260 }}>
            <Line data={data} options={options} />
          </div>
        )}
      </Card.Body>
    </Card>
  );
}
