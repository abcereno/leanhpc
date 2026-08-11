import { Line } from "react-chartjs-2";

export default function NetProfitTrend({ payroll, totalIncome, totalExpenses }) {
  const data = {
    labels: payroll.map((p) => `${p.week_start} - ${p.week_end}`),
    datasets: [
      {
        label: "Net Profit",
        data: payroll.map(
          (p) => totalIncome - totalExpenses - (p.total_pay || 0)
        ),
        borderColor: "#4caf50",
        fill: false,
      },
    ],
  };

  return (
    <div>
      <h5>Net Profit Trend</h5>
      <Line data={data} />
    </div>
  );
}
