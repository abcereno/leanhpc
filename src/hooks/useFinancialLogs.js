import { useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";

export default function useFinancialLogs(startDate, endDate) {
  // datasets
  const [incomes, setIncomes] = useState([]);
  const [expenses, setExpenses] = useState([]);
  const [payroll, setPayroll] = useState([]);
  const [bonuses, setBonuses] = useState([]);
  const [profiles, setProfiles] = useState([]);
  const [clients, setClients] = useState([]);

  // totals
  const [totalIncome, setTotalIncome] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [totalPayroll, setTotalPayroll] = useState(0);
  const [totalBonuses, setTotalBonuses] = useState(0);
  const [netProfit, setNetProfit] = useState(0);

  // ui state
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // helper: apply inclusive date range to a given column
  const applyDateRange = (query, col) => {
    let q = query;
    if (startDate) q = q.gte(col, startDate);
    if (endDate) q = q.lte(col, endDate);
    return q;
    // NOTE: startDate/endDate expected as 'YYYY-MM-DD'
  };

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);

    try {
      // ---- Incomes
      let iq = supabase
        .from("incomes")
        .select(
          `
          *,
          client_name,
          client:client_id ( id, full_name ),
          employee:employee_id ( id, full_name )
        `
        )
        .order("date", { ascending: false });
      iq = applyDateRange(iq, "date");
      const { data: incomeData, error: incomeError } = await iq;
      if (incomeError) throw incomeError;
      const incomeTotal = (incomeData || []).reduce(
        (sum, r) => sum + Number(r.amount || 0),
        0
      );

      // ---- Expenses
      let eq = supabase
        .from("expenses")
        .select(
          `
          *,
          employee:employee_id ( id, full_name ),
          company:company_id ( id, company_name )
        `
        )
        .order("date", { ascending: false });
      eq = applyDateRange(eq, "date");
      const { data: expenseData, error: expenseError } = await eq;
      if (expenseError) throw expenseError;
      const expensesTotal = (expenseData || []).reduce(
        (sum, r) => sum + Number(r.amount || 0),
        0
      );

      // ---- Payroll Summary
      // Use the payroll period for filtering (week_start/week_end)
      let pq = supabase
        .from("payroll_summary")
        .select(`*, profiles:employee_id ( full_name )`)
        .order("week_start", { ascending: false });
      if (startDate) pq = pq.gte("week_start", startDate);
      if (endDate) pq = pq.lte("week_end", endDate);
      const { data: payrollData, error: payrollError } = await pq;
      if (payrollError) throw payrollError;
      const payrollTotal = (payrollData || []).reduce(
        (sum, r) => sum + Number(r.total_pay || 0),
        0
      );

      // ---- Bonuses (filter by bonus period, not insertion time)
      let bq = supabase
        .from("payroll_bonuses")
        .select(`
          id, week_start, employee_id, bonus_amount, reason, created_at,
          profiles:employee_id ( id, full_name )
        `)
        .order("week_start", { ascending: false });
      if (startDate) bq = bq.gte("week_start", startDate);
      if (endDate) bq = bq.lte("week_start", endDate);
      const { data: bonusData, error: bonusError } = await bq;
      if (bonusError) throw bonusError;
      const bonusesTotal = (bonusData || []).reduce(
        (s, r) => s + Number(r.bonus_amount || 0),
        0
      );

      // ---- Set state
      setIncomes(incomeData || []);
      setExpenses(expenseData || []);
      setPayroll(payrollData || []);
      setBonuses(bonusData || []);

      setTotalIncome(incomeTotal);
      setTotalExpenses(expensesTotal);
      setTotalPayroll(payrollTotal);
      setTotalBonuses(bonusesTotal);

      // Net profit includes bonuses as compensation cost
      setNetProfit(incomeTotal - expensesTotal - payrollTotal - bonusesTotal);
    } catch (err) {
      console.error(err);
      setErrorMsg(err?.message || "Failed to fetch financial logs.");
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  const fetchProfiles = useCallback(async () => {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .order("full_name", { ascending: true });
    if (!error && data) setProfiles(data);
  }, []);

  const fetchClients = useCallback(async () => {
    const { data, error } = await supabase
      .from("clients")
      .select("id, full_name")
      .order("full_name", { ascending: true });
    if (!error && data) setClients(data);
  }, []);

  // ---- Inserts
  const addIncome = useCallback(
    async (payload) => {
      const today = new Date().toISOString().slice(0, 10);
      const row = {
        client_id: payload.client_id || null,
        employee_id: payload.employee_id || null,
        amount: Number(payload.amount),
        date: payload.date || today,
        category: payload.category || null,
        source: payload.source || null,
        notes: payload.notes || null,
      };
      const { error } = await supabase.from("incomes").insert([row]);
      if (!error) await fetchLogs();
      return { error };
    },
    [fetchLogs]
  );

  const addExpense = useCallback(
    async (payload) => {
      const today = new Date().toISOString().slice(0, 10);
      const row = {
        category: payload.category, // required
        amount: Number(payload.amount),
        date: payload.date || today,
        notes: payload.notes || null,
        vendor: payload.vendor || null,
        employee_id: payload.employee_id || null,
        company_id: payload.company_id || null,
      };
      const { error } = await supabase.from("expenses").insert([row]);
      if (!error) await fetchLogs();
      return { error };
    },
    [fetchLogs]
  );

  const addBonus = useCallback(
    async (payload) => {
      const row = {
        week_start: payload.week_start, // 'YYYY-MM-DD'
        employee_id: payload.employee_id,
        bonus_amount: Number(payload.bonus_amount),
        reason: payload.reason || null,
      };
      const { error } = await supabase.from("payroll_bonuses").insert([row]);
      if (!error) await fetchLogs();
      return { error };
    },
    [fetchLogs]
  );

  // ---- Updates / Deletes
  const updateIncome = useCallback(
    async (id, patch) => {
      const { error } = await supabase.from("incomes").update(patch).eq("id", id);
      if (!error) await fetchLogs();
      return { error };
    },
    [fetchLogs]
  );

  const deleteIncome = useCallback(
    async (id) => {
      const { error } = await supabase.from("incomes").delete().eq("id", id);
      if (!error) await fetchLogs();
      return { error };
    },
    [fetchLogs]
  );

  const updateExpense = useCallback(
    async (id, patch) => {
      const { error } = await supabase.from("expenses").update(patch).eq("id", id);
      if (!error) await fetchLogs();
      return { error };
    },
    [fetchLogs]
  );

  const deleteExpense = useCallback(
    async (id) => {
      const { error } = await supabase.from("expenses").delete().eq("id", id);
      if (!error) await fetchLogs();
      return { error };
    },
    [fetchLogs]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      await Promise.all([fetchLogs(), fetchProfiles(), fetchClients()]);
      if (!mounted) return;
    })();
    return () => {
      mounted = false;
    };
  }, [fetchLogs, fetchProfiles, fetchClients]);

  // ---- Compat: merge incomes + expenses for charts that expect a single series
  const logs = useMemo(() => {
    const inc = (incomes || []).map((r) => ({
      id: r.id,
      date: r.date,
      amount: Number(r.amount || 0),
      log_type: "income",
      category: r.category || null,
      source: r.source || null,
      notes: r.notes || null,
      client_id: r.client_id || null,
      employee_id: r.employee_id || null,
    }));
    const exp = (expenses || []).map((r) => ({
      id: r.id,
      date: r.date,
      amount: Number(r.amount || 0),
      log_type: "expense",
      category: r.category || null,
      notes: r.notes || null,
      vendor: r.vendor || null,
      employee_id: r.employee_id || null,
      company_id: r.company_id || null,
    }));
    // sort by date ascending for trend charts
    return [...inc, ...exp].sort((a, b) => (a.date > b.date ? 1 : -1));
  }, [incomes, expenses]);

  // convenience: total compensation = payroll + bonuses
  const totalCompensation = useMemo(
    () => Number(totalPayroll || 0) + Number(totalBonuses || 0),
    [totalPayroll, totalBonuses]
  );

  const refresh = fetchLogs;

  return {
    // data
    incomes,
    expenses,
    logs,            // incomes + expenses, for existing charts
    payroll,
    bonuses,
    profiles,
    clients,

    // totals
    totalIncome,
    totalExpenses,
    totalPayroll,
    totalBonuses,
    totalCompensation,
    netProfit,

    // state
    loading,
    errorMsg,

    // actions
    fetchLogs,
    refresh,
    addIncome,
    addExpense,
    addBonus,
    updateIncome,
    deleteIncome,
    updateExpense,
    deleteExpense,
    fetchClients,
  };
}
