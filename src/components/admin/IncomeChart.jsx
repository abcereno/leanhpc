import { Bar } from "react-chartjs-2";

export default function IncomeChart({ totalIncome, totalExpenses, totalPayroll }) {
  const data = {
    labels: ["Income", "Expenses", "Payroll"],
    datasets: [
      {
        label: "Amount ($)",
        data: [totalIncome, totalExpenses, totalPayroll],
        backgroundColor: ["#4cafef", "#f44336", "#ff9800"],
      },
    ],
  };

  return (
    <div>
      <h5>Income vs Expenses vs Payroll</h5>
      <Bar data={data} />
    </div>
  );
}
