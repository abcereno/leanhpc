import React from "react";
import { Page, Text, View, Document, StyleSheet } from "@react-pdf/renderer";
import dayjs from "dayjs";
import { BRAND } from "./brand";

// ---------- helpers ----------
const currency = (v) => (v === 0 || v ? `$${Number(v).toLocaleString()}` : "-");
const pct = (v) => (v === 0 || v ? `${Number(v).toFixed(0)}%` : "-");
const safe = (v, fb = "-") => (v === 0 || v ? String(v) : fb);

// Accept either full API response or just the pdfData object
const resolvePdf = (data) => {
  if (!data) return {};
  if (data.pdfData) {
    return {
      ...data.pdfData,
      calls: data.calls || data.pdfData.calls,
      docs: data.docs || data.pdfData.docs,
    };
  }
  return data;
};

// ---------- palette (with safe fallbacks) ----------
const C = {
  black: BRAND?.colors?.black || "#0B0B0C",
  white: BRAND?.colors?.white || "#FFFFFF",
  gold: BRAND?.colors?.gold || "#C7A43A",
  royal: BRAND?.colors?.royal || "#2C3E8F",
  gray50: BRAND?.colors?.gray50 || "#FAFAFB",
  gray100: BRAND?.colors?.gray100 || "#F3F4F6",
  gray200: BRAND?.colors?.gray200 || "#E5E7EB",
  gray400: BRAND?.colors?.gray400 || "#9CA3AF",
  gray600: BRAND?.colors?.gray600 || "#6B7280",
  gray800: BRAND?.colors?.gray800 || "#1F2937",
};

// ---------- styles ----------
const s = StyleSheet.create({
  page: {
    padding: 26,
    backgroundColor: C.white,
  },

  // HERO
  hero: {
    backgroundColor: C.black,
    color: C.white,
    borderRadius: 8,
    padding: 18,
    borderWidth: 1,
    borderColor: C.gold,
  },
  heroRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" },
  brandTitle: { fontSize: 18, marginBottom: 2, fontWeight: "bold", letterSpacing: 0.2 },
  brandSub: { fontSize: 9, opacity: 0.95 },
  badgeWrap: { alignItems: "flex-end" },
  eliteBadge: {
    fontSize: 9,
    backgroundColor: C.gold,
    color: C.black,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 999,
    fontWeight: "bold",
  },
  micro: { fontSize: 8, marginTop: 6, color: C.gray100 },

  // SECTION
  section: {
    marginTop: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.gray200,
    overflow: "hidden",
  },
  sectionHead: {
    backgroundColor: C.black,
    color: C.gold,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: C.gold,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  h2: { fontSize: 12, fontWeight: "bold" },
  headNote: { fontSize: 9, color: C.white },

  sectionBody: { padding: 12, backgroundColor: C.gray50 },

  // KPIs
  row: { flexDirection: "row", gap: 8 },
  col: { flex: 1 },
  kpiCard: {
    backgroundColor: C.white,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.gray200,
    marginBottom: 8,
  },
  kpiLabel: { fontSize: 9, color: C.gray600, marginBottom: 3 },
  kpiValue: { fontSize: 14, fontWeight: "bold" },
  kpiGold: {
    fontSize: 12,
    fontWeight: "bold",
    borderWidth: 1,
    borderColor: C.gold,
    borderRadius: 6,
    paddingVertical: 3,
    paddingHorizontal: 8,
    alignSelf: "flex-start",
  },

  // TABLE
  table: {
    borderWidth: 1,
    borderColor: C.gray200,
    borderRadius: 6,
    overflow: "hidden",
  },
  tr: { flexDirection: "row" },
  th: {
    flex: 1,
    fontSize: 10,
    fontWeight: "bold",
    padding: 7,
    backgroundColor: C.black,
    color: C.gold,
    borderRightWidth: 1,
    borderRightColor: C.gray200,
  },
  thLast: { borderRightWidth: 0 },
  td: {
    flex: 1,
    fontSize: 10,
    padding: 7,
    backgroundColor: C.white,
    borderTopWidth: 1,
    borderTopColor: C.gray200,
    borderRightWidth: 1,
    borderRightColor: C.gray200,
  },
  tdLast: { borderRightWidth: 0 },

  // TEXT
  pill: {
    fontSize: 9,
    backgroundColor: C.gold,
    color: C.black,
    paddingVertical: 2,
    paddingHorizontal: 6,
    borderRadius: 999,
    fontWeight: "bold",
  },
  muted: { fontSize: 9, color: C.gray600 },
  listItem: { fontSize: 10, marginBottom: 4 },

  // FOOTER
  footer: {
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: C.gray200,
    paddingTop: 8,
    fontSize: 8,
    color: C.gray600,
    textAlign: "center",
  },

  // INFO GRID
  infoGrid: { flexDirection: "row", gap: 8 },
  infoCard: {
    flex: 1,
    backgroundColor: C.white,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: C.gray200,
  },
  infoLabel: { fontSize: 9, color: C.gray600, marginBottom: 3 },
  infoValue: { fontSize: 10, fontWeight: "bold" },
});

export default function AuditDoc({ data }) {
  const pdf = resolvePdf(data);
  const created = pdf?.created_at
    ? dayjs(pdf.created_at).format("MM/DD/YYYY")
    : dayjs().format("MM/DD/YYYY");
  const provider = pdf?.monitoring?.provider || "SmartCredit";
  const asOf = pdf?.monitoring?.as_of || pdf?.report_date || created;

  // optional scores object: { exp, tu, eq, avg }
  const scores = pdf?.scores || {};
  const utilPct = pdf?.util?.usage_pct;

  return (
    <Document>
      <Page size="LETTER" style={s.page}>
        {/* HERO */}
        <View style={s.hero}>
          <View style={s.heroRow}>
            <View>
              <Text style={s.brandTitle}>Credit Audit Report</Text>
              <Text style={s.brandSub}>
                Prepared for {safe(pdf?.client?.full_name)} • Created {created}
              </Text>
              <Text style={s.brandSub}>
                {provider} as of {safe(asOf)} • {BRAND.name} • {BRAND.email} • {BRAND.phone}
              </Text>
            </View>
            <View style={s.badgeWrap}>
              <Text style={s.eliteBadge}>ELITE EDITION</Text>
              <Text style={s.micro}>Confidential • For Client Guidance</Text>
            </View>
          </View>
        </View>

        {/* SNAPSHOT */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.h2}>Snapshot</Text>
            <Text style={s.headNote}>Overview of key metrics</Text>
          </View>
          <View style={s.sectionBody}>
            <View style={s.row}>
              <View style={s.col}>
                <View style={s.kpiCard}>
                  <Text style={s.kpiLabel}>Total Accounts</Text>
                  <Text style={s.kpiValue}>{safe(pdf?.summary?.accounts)}</Text>
                </View>
                <View style={s.kpiCard}>
                  <Text style={s.kpiLabel}>Inquiries (24 months)</Text>
                  <Text style={s.kpiValue}>{safe(pdf?.summary?.inquiries)}</Text>
                </View>
              </View>
              <View style={s.col}>
                <View style={s.kpiCard}>
                  <Text style={s.kpiLabel}>Collections</Text>
                  <Text style={s.kpiValue}>{safe(pdf?.summary?.collections)}</Text>
                </View>
                <View style={s.kpiCard}>
                  <Text style={s.kpiLabel}>Public Records</Text>
                  <Text style={s.kpiValue}>{safe(pdf?.summary?.public_records)}</Text>
                </View>
              </View>
              <View style={s.col}>
                <View style={s.kpiCard}>
                  <Text style={s.kpiLabel}>Total Revolving Limit</Text>
                  <Text style={s.kpiValue}>{currency(pdf?.util?.total_limit)}</Text>
                </View>
                <View style={s.kpiCard}>
                  <Text style={s.kpiLabel}>Utilization</Text>
                  <Text style={s.kpiGold}>{pct(utilPct)}</Text>
                </View>
              </View>
            </View>

            {/* Optional Scores Row */}
            {(scores.exp || scores.tu || scores.eq || scores.avg) && (
              <View style={s.infoGrid}>
                <View style={s.infoCard}>
                  <Text style={s.infoLabel}>Experian</Text>
                  <Text style={s.infoValue}>{safe(scores.exp)}</Text>
                </View>
                <View style={s.infoCard}>
                  <Text style={s.infoLabel}>TransUnion</Text>
                  <Text style={s.infoValue}>{safe(scores.tu)}</Text>
                </View>
                <View style={s.infoCard}>
                  <Text style={s.infoLabel}>Equifax</Text>
                  <Text style={s.infoValue}>{safe(scores.eq)}</Text>
                </View>
                <View style={s.infoCard}>
                  <Text style={s.infoLabel}>Average</Text>
                  <Text style={s.infoValue}>{safe(scores.avg)}</Text>
                </View>
              </View>
            )}
          </View>
        </View>

        {/* NEGATIVE ITEMS */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.h2}>Items Impacting Score</Text>
            <Text style={s.headNote}>FCRA / FCBA compliant dispute process</Text>
          </View>
          <View style={s.sectionBody}>
            <View style={s.table}>
              <View style={s.tr}>
                <Text style={s.th}>Account</Text>
                <Text style={s.th}>Issue</Text>
                <Text style={[s.th, s.thLast]}>Notes</Text>
              </View>
              {(pdf?.negatives?.length ? pdf.negatives : []).map((n, i) => (
                <View key={i} style={s.tr}>
                  <Text style={s.td}>{safe(n.account)}</Text>
                  <Text style={s.td}>{safe(n.issue)}</Text>
                  <Text style={[s.td, s.tdLast]}>{safe(n.notes)}</Text>
                </View>
              ))}
              {!pdf?.negatives?.length && (
                <View style={s.tr}>
                  <Text style={[s.td, s.tdLast]}>No negative items provided.</Text>
                </View>
              )}
            </View>
            <Text style={[s.muted, { marginTop: 6 }]}>
              Tip: Keep utilization under 9–11% across each revolving line for optimal scoring impact.
            </Text>
          </View>
        </View>

        {/* PLAN OF ACTION */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.h2}>Our Plan of Action</Text>
            <Text style={s.headNote}>What we will do next</Text>
          </View>
          <View style={s.sectionBody}>
            {(pdf?.plan?.length ? pdf.plan : []).map((p, i) => (
              <Text key={i} style={s.listItem}>• {p}</Text>
            ))}
            {!pdf?.plan?.length && <Text style={s.muted}>No plan items added.</Text>}
            <Text style={[s.muted, { marginTop: 8 }]}>
              We dispute under applicable consumer laws and update you via your secure client portal.
            </Text>
          </View>
        </View>

        {/* CLIENT NEXT STEPS */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.h2}>Your Next Steps</Text>
            <Text style={s.headNote}>How to help speed results</Text>
          </View>
          <View style={s.sectionBody}>
            {(pdf?.next_steps?.length ? pdf.next_steps : []).map((p, i) => (
              <Text key={i} style={s.listItem}>{i + 1}. {p}</Text>
            ))}
            {!pdf?.next_steps?.length && <Text style={s.muted}>No next steps added.</Text>}
          </View>
        </View>

        {/* ACTIVITY */}
        <View style={s.section}>
          <View style={s.sectionHead}>
            <Text style={s.h2}>Recent Activity</Text>
            <Text style={s.headNote}>Calls & documents</Text>
          </View>
          <View style={s.sectionBody}>
            <View style={s.table}>
              <View style={s.tr}>
                <Text style={s.th}>Date</Text>
                <Text style={s.th}>Experian</Text>
                <Text style={s.th}>TransUnion</Text>
                <Text style={[s.th, s.thLast]}>Equifax</Text>
              </View>
              {(pdf?.calls?.length ? pdf.calls : []).map((c, i) => (
                <View key={i} style={s.tr}>
                  <Text style={s.td}>{safe(dayjs(c.call_date).format("MM/DD/YYYY"))}</Text>
                  <Text style={s.td}>{safe(c.exp_result)}</Text>
                  <Text style={s.td}>{safe(c.tu_result)}</Text>
                  <Text style={[s.td, s.tdLast]}>{safe(c.eq_result)}</Text>
                </View>
              ))}
              {!pdf?.calls?.length && (
                <View style={s.tr}>
                  <Text style={[s.td, s.tdLast]}>No recent call logs.</Text>
                </View>
              )}
            </View>
            <Text style={[s.muted, { marginTop: 6 }]}>
              Documents uploaded: {(pdf?.docs?.length || 0)} item(s).
            </Text>
          </View>
        </View>

        {/* FOOTER */}
        <Text style={s.footer}>
          © {new Date().getFullYear()} {BRAND.name}. Elite Edition • Confidential.
          This report is for guidance only and does not guarantee credit approvals.
        </Text>
      </Page>
    </Document>
  );
}