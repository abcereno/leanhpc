// src/utils/clientPayments.js
//
// "How much has this client actually paid so far" — derived live from the
// `incomes` table rather than a manually-tracked counter, so it can never
// drift out of sync with the real income ledger (see
// sql/add_payment_plan.sql's header comment).
//
// Every auto-recorded client payment goes through markClientPaid.js, which
// inserts an `incomes` row with a STABLE `source: "Client Payment"` —
// `category` is the variable service label (e.g. "Inquiry Deletion") and is
// NOT a reliable filter key here. Staff can also log a payment by hand from
// the Financial Dashboard's Add Income form using the same "Client Payment"
// source, so this picks those up too.
import { supabase } from "../supabaseClient";

/**
 * @param {string} clientId
 * @returns {Promise<{ totalPaid: number, paymentsCount: number, lastPaymentDate: string|null, lastPaymentAmount: number|null }>}
 */
export async function fetchClientPaymentSummary(clientId) {
  const empty = { totalPaid: 0, paymentsCount: 0, lastPaymentDate: null, lastPaymentAmount: null };
  if (!clientId) return empty;

  const { data, error } = await supabase
    .from("incomes")
    .select("amount, date")
    .eq("client_id", clientId)
    .eq("source", "Client Payment")
    .order("date", { ascending: false });

  if (error) {
    console.warn("Could not load client payment history:", error.message);
    return empty;
  }
  if (!data || data.length === 0) return empty;

  const totalPaid = data.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
  return {
    totalPaid,
    paymentsCount: data.length,
    lastPaymentDate: data[0].date || null,
    lastPaymentAmount: Number(data[0].amount) || null,
  };
}
