// src/utils/mapSmartCredit.js
export function mapSmartCreditToProps(data = {}) {
  if (!data || data.success !== true) return {};

  // --- Scores ---
  const ex = data.scores?.EX?.score ?? null;
  const tu = data.scores?.TU?.score ?? null;
  const eq = data.scores?.EQ?.score ?? null;
  const avg =
    [ex, tu, eq].filter(n => typeof n === "number").length > 0
      ? Math.round(
          [ex, tu, eq]
            .filter(n => typeof n === "number")
            .reduce((a, b) => a + b, 0) /
            [ex, tu, eq].filter(n => typeof n === "number").length
        )
      : null;

  // --- Summary (top chips) ---
  const summary = {
    accounts: data.summary?.accounts ?? "—",
    open: data.summary?.open ?? "—",
    closed: data.summary?.closed ?? "—",
    collections: data.summary?.collections ?? "—",
    public_records: data.summary?.public_records ?? "—",
    inquiries: data.summary?.inquiries ?? "—",
  };

  // --- Utilization box ---
  const usagePct = data.utilization?.usagePct ?? null;
  const utilization = {
    utilizationNote:
      "Maxing out your credit cards lowers your score. Pay balances below 30% of each card's limit.",
    percent:
      typeof usagePct === "number"
        ? `${usagePct}%`
        : (data.utilization?.usagePct === 0 ? "0%" : "—"),
    available:
      typeof data.utilization?.totalLimit === "number"
        ? data.utilization.totalLimit
        : "—",
    balance:
      typeof data.utilization?.totalBal === "number"
        ? data.utilization.totalBal
        : "—",
    monitorReminder:
      "Keep credit monitoring active throughout the process for accurate baseline tracking.",
  };

  // --- Bureau summaries grid ---
  const bs = data.bureau_summary || {};
  const bureauSummaries = [
    {
      bureau: "Experian",
      accounts:
        (bs.EX?.open ?? 0) + (bs.EX?.closed ?? 0) || undefined,
      inquiries: bs.EX?.inquiries_2y ?? undefined,
      publicRecords: data.summary?.public_records ?? undefined,
      collections: bs.EX?.collections ?? undefined,
      positive: undefined,
      negative: bs.EX?.derogatory ?? undefined,
    },
    {
      bureau: "TransUnion",
      accounts:
        (bs.TU?.open ?? 0) + (bs.TU?.closed ?? 0) || undefined,
      inquiries: bs.TU?.inquiries_2y ?? undefined,
      publicRecords: data.summary?.public_records ?? undefined,
      collections: bs.TU?.collections ?? undefined,
      positive: undefined,
      negative: bs.TU?.derogatory ?? undefined,
    },
    {
      bureau: "Equifax",
      accounts:
        (bs.EQ?.open ?? 0) + (bs.EQ?.closed ?? 0) || undefined,
      inquiries: bs.EQ?.inquiries_2y ?? undefined,
      publicRecords: data.summary?.public_records ?? undefined,
      collections: bs.EQ?.collections ?? undefined,
      positive: undefined,
      negative: bs.EQ?.derogatory ?? undefined,
    },
  ];

  // --- Derogatory counts (per-bureau) ---
  const derogatorySummary = {
    counts: {
      delinquent: null, // not present in SmartCredit summary; leaving null
      derogatory: {
        Experian: bs.EX?.derogatory ?? 0,
        TransUnion: bs.TU?.derogatory ?? 0,
        Equifax: bs.EQ?.derogatory ?? 0,
      },
      collection: {
        Experian: bs.EX?.collections ?? 0,
        TransUnion: bs.TU?.collections ?? 0,
        Equifax: bs.EQ?.collections ?? 0,
      },
      publicRecords: {
        Experian: data.summary?.public_records ?? 0,
        TransUnion: data.summary?.public_records ?? 0,
        Equifax: data.summary?.public_records ?? 0,
      },
      inquiries2yr: {
        Experian: bs.EX?.inquiries_2y ?? 0,
        TransUnion: bs.TU?.inquiries_2y ?? 0,
        Equifax: bs.EQ?.inquiries_2y ?? 0,
      },
    },
    items: [], // You can populate this later if you derive derogatory items list
  };

  // --- Inquiries list (flattened) ---
  const inquiries = []
    .concat(
      (data.inquiries?.EX ?? []).map(it => ({
        creditor: it.creditor,
        name: it.creditor,
        date: it.date,
        label: "Inquiry",
        bureau: "Experian",
      }))
    )
    .concat(
      (data.inquiries?.TU ?? []).map(it => ({
        creditor: it.creditor,
        name: it.creditor,
        date: it.date,
        label: "Inquiry",
        bureau: "TransUnion",
      }))
    )
    .concat(
      (data.inquiries?.EQ ?? []).map(it => ({
        creditor: it.creditor,
        name: it.creditor,
        date: it.date,
        label: "Inquiry",
        bureau: "Equifax",
      }))
    );

  return {
    createdDate: data.as_of || "",
    scores: { exp: ex ?? "—", tu: tu ?? "—", eq: eq ?? "—", avg: avg ?? "—" },
    summary,
    utilization,
    bureauSummaries,
    derogatorySummary,
    publicRecords: Array.isArray(data.public_records) ? data.public_records : [],
    inquiries,
  };
}
