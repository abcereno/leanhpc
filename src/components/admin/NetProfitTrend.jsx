import { Line } from "react-chartjs-2";
import { sumInWeek } from "../../utils/weekRangeSum";

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
  const data = {
    labels: payroll.map((p) => `${p.week_start} - ${p.week_end}`),
    datasets: [
      {
        label: "Net Profit",
        data: payroll.map((p) => {
          const weekIncome = sumInWeek(incomes, { weekStart: p.week_start, weekEnd: p.week_end });
          const weekExpenses = sumInWeek(expenses, { weekStart: p.week_start, weekEnd: p.week_end });
          const weekBonuses = sumInWeek(bonuses, {
            dateKey: "week_start",
            amountKey: "bonus_amount",
            weekStart: p.week_start,
            weekEnd: p.week_end,
          });
          return weekIncome - weekExpenses - Number(p.total_pay || 0) - weekBonuses;
        }),
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
