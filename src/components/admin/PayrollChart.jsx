import { Bar } from "react-chartjs-2";

export default function PayrollChart({ payroll }) {
  const data = {
    labels: payroll.map((p) => p.profiles?.full_name || p.employee_id),
    datasets: [
      {
        label: "Total Pay ($)",
        data: payroll.map((p) => p.total_pay),
        backgroundColor: "#2196f3",
      },
    ],
  };

  return (
    <div>
      <h5>Payroll Distribution</h5>
      <Bar data={data} />
    </div>
  );
}
