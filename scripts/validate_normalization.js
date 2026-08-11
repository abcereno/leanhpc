#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

function readJSON(fp) {
  return JSON.parse(fs.readFileSync(fp, 'utf8'));
}

function findAny(obj, predicate) {
  if (!obj || typeof obj !== 'object') return null;
  if (predicate(obj)) return obj;
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (v && typeof v === 'object') {
      const found = findAny(v, predicate);
      if (found) return found;
    }
  }
  return null;
}

function ensureArray(x) { return Array.isArray(x) ? x : (x ? [x] : []); }

function safeNameEntry(n) {
  if (!n) return '';
  if (typeof n === 'string') return n.trim();
  const candidate = n.Name || n.FullName || n.name || n;
  if (!candidate) return '';
  if (typeof candidate === 'string') return candidate.trim();
  if (candidate.FullName) return String(candidate.FullName).trim();
  if (candidate.first || candidate.last) return `${candidate.first || ''} ${candidate.last || ''}`.trim();
  return '';
}

function findValueByKeys(obj, keyNames) {
  if (!obj || typeof obj !== 'object') return null;
  for (const k of Object.keys(obj)) {
    if (keyNames.includes(k)) return obj[k];
    const v = obj[k];
    if (v && typeof v === 'object') {
      const found = findValueByKeys(v, keyNames);
      if (found !== null && found !== undefined) return found;
    }
  }
  return null;
}

function extractSsnFromObject(obj) {
  const candidates = ['SocialSecurityNumber','SSN','SocialSecurity','SocialNumber','Number','SSNNumber'];
  const val = findValueByKeys(obj, candidates);
  if (!val) return null;
  const s = typeof val === 'string' ? val : (val.$ || val['$'] || null);
  if (!s) return null;
  const digits = String(s).replace(/[^0-9]/g, '');
  return digits.length >= 4 ? digits : null;
}

function extractMerge(obj) {
  // Try to find MergeCreditReports object in any nesting
  const merge = findAny(obj, o => o && (o.MergeCreditReports || o.TrueLinkCreditReportType || o.TrueLinkCreditReportType === undefined && o.FraudIndicator !== undefined));
  if (!merge) return null;
  if (merge.MergeCreditReports) return merge.MergeCreditReports;
  if (merge.TrueLinkCreditReportType) return merge.TrueLinkCreditReportType;
  // If object itself looks like TrueLinkCreditReportType
  if (merge.FraudIndicator !== undefined && merge.Borrower) return merge;
  return null;
}

function extractFromReport(obj, sourceHint) {
  const merge = extractMerge(obj.report || obj);
  const out = { meta: { source: sourceHint || 'unknown', imported_at: new Date().toISOString() }, borrower: {}, scores: [], tradelines: [], inquiries: [] };

  if (!merge) return out;

  // Borrower
  const borrower = merge.Borrower || {};
  out.borrower.ssn = borrower.SocialSecurityNumber || borrower.SSN || extractSsnFromObject(borrower) || null;
  out.borrower.names = [];
  if (Array.isArray(borrower.BorrowerName)) {
    out.borrower.names = borrower.BorrowerName.map(n => safeNameEntry(n)).filter(Boolean);
  }
  out.borrower.birth_date = (Array.isArray(borrower.Birth) && borrower.Birth[0]?.BirthDate) || null;
  out.borrower.addresses = ensureArray(borrower.BorrowerAddress || borrower.PreviousAddress || []);

  // Fallback: if no names found, search root for common name fields
  if (!out.borrower.names.length) {
    const maybeName = findValueByKeys(obj, ['BorrowerName','Name','FullName','PersonName']);
    if (maybeName) {
      if (Array.isArray(maybeName)) out.borrower.names = maybeName.map(n => safeNameEntry(n)).filter(Boolean);
      else out.borrower.names = [safeNameEntry(maybeName)].filter(Boolean);
    }
  }

  // Scores: search in BundleComponent style and in Borrower.CreditScore
  // BundleComponents path
  const bundle = findAny(obj, o => Array.isArray(o.BundleComponent));
  if (bundle && Array.isArray(bundle.BundleComponent)) {
    for (const c of bundle.BundleComponent) {
      if (c.CreditScoreType) {
        const s = c.CreditScoreType;
        const bureau = s.Source?.Bureau?.symbol || c.Type || s.Source?.Bureau?.abbreviation || 'UNKNOWN';
        out.scores.push({ bureau, score: s.riskScore || s.score || null, model: s.CreditScoreModel?.abbreviation || s.scoreName || null, date: s.Source?.InquiryDate || null });
      }
    }
  }

  // Borrower.CreditScore array fallback
  if (merge.Borrower && Array.isArray(merge.Borrower.CreditScore)) {
    for (const cs of merge.Borrower.CreditScore) {
      out.scores.push({ bureau: cs.Source?.Bureau?.symbol || cs.Source?.Bureau?.abbreviation || cs.bureau || 'UNKNOWN', score: cs.riskScore || cs.score || null, model: cs.CreditScoreModel?.abbreviation || null, date: cs.Source?.InquiryDate || null });
    }
  }

  // Tradelines: flatten TradeLinePartition.Tradeline arrays
  const partitions = merge.TradeLinePartition || [];
  for (const p of ensureArray(partitions)) {
    const tlines = ensureArray(p.Tradeline || p.TradeLine || []);
    for (const t of tlines) {
      out.tradelines.push({ accountType: t.accountTypeAbbreviation || p.accountTypeAbbreviation || t.accountTypeSymbol || null, creditor: t.SubscriberName || t.Creditor || t.name || null, balance: t.CurrentBalance || t.Balance || t.currentBalance || null, status: t.paymentStatus || t.Status || null });
    }
  }

  // Inquiries: flatten InquiryPartition.Inquiry arrays
  const iqPartitions = merge.InquiryPartition || [];
  for (const p of ensureArray(iqPartitions)) {
    const inqs = ensureArray(p.Inquiry || []);
    for (const iq of inqs) {
      out.inquiries.push({ bureau: iq.Bureau || iq.Source?.Bureau || null, date: iq.InquiryDate || iq.date || null, name: iq.SubscriberName || iq.Source || iq.name || null });
    }
  }

  return out;
}

function summarize(norm) {
  const missing = [];
  if (!norm.borrower || (!norm.borrower.ssn && (norm.borrower.names || []).length === 0)) missing.push('borrower.identification');
  if (!norm.scores || norm.scores.length === 0) missing.push('scores');
  if (!norm.tradelines || norm.tradelines.length === 0) missing.push('tradelines');
  if (!norm.inquiries || norm.inquiries.length === 0) missing.push('inquiries');
  return {
    meta: norm.meta,
    counts: { scores: norm.scores.length, tradelines: norm.tradelines.length, inquiries: norm.inquiries.length },
    missing
  };
}

async function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) {
    console.error('Usage: node validate_normalization.js <input.json> [sourceHint]');
    process.exit(2);
  }
  const inputFile = path.resolve(args[0]);
  if (!fs.existsSync(inputFile)) { console.error('File not found:', inputFile); process.exit(3); }
  const srcHint = args[1] || null;
  const input = readJSON(inputFile);
  const normalized = extractFromReport(input, srcHint || undefined);
  const report = summarize(normalized);
  console.log(JSON.stringify({ normalized, report }, null, 2));
  if (report.missing.length) process.exit(4);
}

main().catch(e => { console.error(e); process.exit(1); });
