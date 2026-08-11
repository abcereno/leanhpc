import { Pie } from "react-chartjs-2";

export default function ExpensesChart({ expenses }) {
  const categoryTotals = expenses.reduce((acc, e) => {
    acc[e.category] = (acc[e.category] || 0) + Number(e.amount || 0);
    return acc;
  }, {});

  const data = {
    labels: Object.keys(categoryTotals),
    datasets: [
      {
        label: "Expenses by Category",
        data: Object.values(categoryTotals),
        backgroundColor: ["#ff5722", "#ff9800", "#ffc107", "#8bc34a", "#03a9f4"],
      },
    ],
  };

return (
  <div style={{ width: "50%", height: "auto", margin: "0 auto" }}>
    <h5>Expenses Breakdown</h5>
    <Pie data={data} />
  </div>
);

}
