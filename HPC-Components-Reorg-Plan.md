# src/components Reorganization Plan

Backup taken before any changes: `InquiryDeleter_src_backup_20260711_075612.tar.gz` (full copy of `src/`, shared separately). Nothing has been moved yet — this is the file-by-file plan for review.

## Scale of the change

180 files in `src/components` today (90 flat at the top level, the rest already in 12 subfolders). Roughly 600 relative import statements across the codebase (`from "../..."`) will need updating to match new paths — `App.jsx` alone has 54. This is a big mechanical change; the plan below is meant to be reviewed and adjusted before I execute it.

## Proposed top-level structure

```
src/components/
  admin/
  individual/
  company/
  broker/
  affiliate/       <- see "Affiliate" note below
  shared/
```

### Note: Affiliate doesn't fit the 4 named buckets

Affiliates are a distinct partner type in this codebase — `AffiliateAuthContext.jsx`, the `affiliates`/`affiliate_user_profiles` tables, and `AffiliatePortal/` (6 files) are entirely separate from `CompanyPortal`/`CompanyAuthContext`. They're not a company sub-type the way broker is (broker is literally `companyType === 'broker'` inside the company auth system). Forcing `AffiliatePortal/` into `company/` would misrepresent that separation. I've proposed a 5th bucket, `affiliate/`, alongside broker — but if you'd rather fold it into `company/` as a subfolder, that's a one-line change to the plan below.

---

## admin/ (the largest bucket — internal staff/ops)

**Top-level admin pages & layout**
AIAnalysisModal.jsx, AITestingPlayground.jsx, AITrainingFeedback.jsx, AddAffiliateForm.jsx, AddCompanyForm.jsx, AddEmployee.jsx, AdminActivityLog.jsx, AdminClientList.jsx, AdminDashboard.jsx, AdminDirectory.jsx, AdminLayout.jsx, AdminNavbar.jsx, AdminNotificationWatcher.jsx, AdminPaymentVerifications.jsx, AdminProfile.jsx, AdminServiceOrders.jsx, AdminSidebar.jsx, AlertBell.jsx (only used by AdminNavbar), CallLogs.jsx, CallQueue.jsx, CallRouting.jsx, ClientHeaderActions.jsx, ClientProfile.jsx, ClientSubmissionListener.jsx, CompanyDirectory.jsx (admin's internal company list, `/company` route — not the company portal), CompanyHolidays.jsx, CompanyLeadsList.jsx, CreditReportWorkspace.jsx, DebugRawReportPage.jsx, DocumentLogs.jsx, DocumentRouting.jsx, FinancialDashboard.jsx, ExpensesChart.jsx, IncomeChart.jsx, NetProfitTrend.jsx, PayrollChart.jsx, FunderEligibilityCard.jsx, FunderEligibilityModal.jsx, InquiryRemovalsTable.jsx, IntakeDashboard.jsx, InternalSpreadsheet.jsx, InviteAdmin.jsx, LetterGeneratorUI.jsx, ManagementLogs.jsx, PendingApprovals.jsx, PendingCallbacks.jsx, RegenerateHistoryBtn.jsx (only used by clientProfileComponents/ClientHeader), SetAdminName.jsx, SupportConsole.jsx, UploadReportForm.jsx

**admin/ops/** (this sprint's new Operations Dashboard)
pages/ops/OpsDashboard.jsx, pages/ops/CompanySnapshot.jsx, pages/ops/AgingDashboard.jsx

**admin/client-profile/** (was `clientProfileComponents/`, all 20 files incl. `modals/` and `RemindersSidebar/` subfolders) — AdminClientInvoices.jsx, AdminClientPortalDocs.jsx, AdminCompanyTaskWidget.jsx, BulkEditModal.jsx, ClientHeader.jsx, CommentsSection.jsx, CoverLetterAssets.jsx, DocumentsSection.jsx, EditClientModal.jsx, InquiriesThread.jsx, RawReportDebugger.jsx, RemindersSidebar/RemindersSidebar.jsx, modals/AdminClientInvoices.jsx, modals/ClientSummaryModal.jsx, modals/Fetch3bModal.jsx, modals/InvoiceGeneratorModal.jsx, modals/LogCallModal.jsx, modals/LogDocumentModal.jsx, modals/ParseRreportModal.jsx, modals/SSNManagerModal.jsx

⚠️ **`AdminClientInvoices.jsx` exists in both `clientProfileComponents/` and `clientProfileComponents/modals/`** — both query the `invoices` table. Looks like a leftover duplicate. Worth deciding which one is live before I move both (I'll move both as-is unless you want me to check which is actually imported and drop the other).

**admin/customer-service/** (was `CustomerService/`, 11 files) — AddClientFormStandard.jsx, ClientDocumentsDashboard.jsx, GenerateInvoiceModal.jsx, dashboard-tabs/DocumentsTab.jsx, dashboard-tabs/InquiryListTab.jsx, dashboard-tabs/MessagesTab.jsx, dashboard-tabs/NotesTab.jsx, dashboard-tabs/OverviewTab.jsx, dashboard-tabs/PlaceholderTabs.jsx, dashboard-tabs/ResultsTab.jsx, dashboard-tabs/Timelinetab.jsx

**admin/add-client-sidebar/** — AddClientSidebar/AddClientSidebar.jsx

**admin/smart-idiq/** — SmartIdiQModal/SmartIdiQModal.jsx

**admin/report-canvas/** (was `reportCanvas/`) — OcrPreview.jsx, ParsedInquiryPreview.jsx

---

## individual/ (was `IndividualPortal/`, all 24 files, structure kept as-is)

ClientNotificationBell.jsx, IndividualCreditFileLoader.jsx, IndividualDashboard.jsx, IndividualLayout.jsx, Layout.jsx, RequireIndividualAuth.jsx, Sidebar.jsx, modals/ConsumerInvoices.jsx, modals/ServiceSelectionModal.jsx, modals/UniversalPaymentModal.jsx, sidebars/EbookView.jsx, sidebars/FinancingView.jsx, sidebars/FreshStartClassroom.jsx, sidebars/IndividualClientProfile.jsx, sidebars/RequestHelpView.jsx, sidebars/ServiceConfiguratorView.jsx, sidebars/VisionBoardView.jsx, steps/LetterSelectionModal.jsx, steps/ProfileDashboard.jsx, steps/ProfileStep1.jsx, steps/ProfileStep2.jsx, steps/ProfileStep3.jsx, steps/ProfileStep4.jsx, sub-components/ConsumerDocuments.jsx

This folder is already well-isolated — no changes needed inside it, just the parent move.

---

## company/ (was `CompanyPortal/`, 20 files, structure kept as-is)

AddAgentModal.jsx, AddClientModal.jsx, ClientProfilePage.jsx, ClientStageChart.jsx, CompanyActionCenter.jsx, CompanyClientTasks.jsx, CompanyPortalDashboard.jsx, CompanyPortalLayout.jsx, CompanyPortalLogin.jsx, CompanyPortalNavibar.jsx, CompanyProfile.jsx, CompanySettingsPanel.jsx, CompanyVisionBoard.jsx, CreditRepairClientList.jsx, DashboardOverview.jsx, InquiryRemovalClientList.jsx, InquirySelectionModal.jsx, QuickImportDropdown.jsx, RequireCompanyAuth.jsx, RequiredDocsChecklist.jsx

⚠️ **`CompanyLayout/CompanyLayout.jsx`** (top-level, separate from `CompanyPortal/`) renders the *public, unauthenticated* `/company/:companyId` page — not the logged-in portal. It's company-branded but doesn't use `CompanyAuthContext`. I've put it in `shared/public/` below since it's a public route like the other marketing/public pages, but it could just as reasonably live in `company/public/`. Your call.

---

## broker/ (was `BrokerPortal/` + two files from the oddly-named `pages/` folder)

BrokerAddClientForm.jsx, BrokerClientList.jsx, BrokerDashboard.jsx (was `pages/BrokerDashboard.jsx`), BrokerAddAgentModal.jsx (was `pages/BrokerAddAgentModal.jsx`)

Note: `pages/` currently holds two unrelated things — the broker files above, and the new `ops/` folder (which is going into `admin/ops/`). After this move, `pages/` goes away entirely.

---

## affiliate/ (was `AffiliatePortal/`, 6 files, structure kept as-is)

AffiliatePortalDashboard.jsx, AffiliatePortalLayout.jsx, AffiliatePortalLogin.jsx, AffiliatePortalNavibar.jsx, AffiliateProfile.jsx, RequireAffiliateAuth.jsx

---

## shared/ (layouts, auth, public site, and genuinely cross-portal pieces)

**shared/layout/** — AuthLayout.jsx, MainLayout.jsx, Navibar.jsx, RoleGuard.jsx

**shared/auth/** — Login.jsx, LoginGate.jsx, ResetPassword.jsx, UpdatePassword.jsx, UnderReview.jsx, TermsAndConditions.jsx, PrivacyPolicy.jsx

**shared/public/** (unauthenticated, standalone routes) — LandingPage.jsx, LeadEligibilityFunnel.jsx, EmbeddableEligibilityChecker.jsx, ClientIntakeForm.jsx, PublicClientReceipt.jsx, AddClientForm.jsx (public `/company/:companyId/add-clients` intake, uses CoverLetterAssetsLTOS), CompanyLayout/CompanyLayout.jsx (see note above)

**shared/client-pages/** (routed from *both* the admin portal and the company portal today) — ClientReportPage.jsx, ClientProgressPage.jsx, ProgressReportLayout.jsx, ProgressReportDetails.jsx, ClientFundingBlueprintPage.jsx, FundingBlueprintReport.jsx, ClientAuditPage.jsx, ClientCreditReportDisplay.jsx, CreditAuditLayout.jsx, CreditAuditReport.jsx (this one specifically is used by admin's ClientProfile, ClientReportPage, ClientAuditPage, CreditReportWorkspace, CompanyPortal's QuickImportDropdown, *and* IndividualPortal's ProfileDashboard — genuinely 3-portal shared), CoverLetterAssetsLTOS.jsx (used by both the public AddClientForm and CompanyPortal/AddClientModal)

**shared/ui/** — PdfPreviewModal.jsx, ThemeContext.jsx, ToastNotifier.jsx, AppNotifier.jsx (used by both AuthLayout and MainLayout), InquiryLoader/InquiryLoader.jsx (the app-wide `<Suspense>` fallback in App.jsx — used for every route, not admin-specific despite living loose today), QuickEligibilityChecker.jsx (used by both CompanyPortal and IndividualPortal)

---

## Unused files found during this review (not imported anywhere)

`SimpleAddClientModal.jsx` and `RequireAdmin.jsx` — grepped the whole `src/` tree, neither is imported by anything (RequireAdmin looks superseded by `RoleGuard.jsx`). I've left them out of the folder assignments above. Options: delete them, or park them in a `shared/_unused/` holding folder during the move so nothing is silently lost. Your call — I won't delete anything without you saying so.

---

## What execution actually involves

For each file: move it, then update every file that imports it (path depth changes, e.g. `./AdminSidebar` inside `AdminLayout.jsx` today becomes `./AdminSidebar` still if they move together, but anything importing *across* old top-level flatness like `../CreditAuditReport` will need recalculating). Plus `App.jsx`'s 54 imports all need their paths rewritten to match. I'd do this with a script (find-and-replace driven off the exact old-path → new-path map above) rather than by hand, then a lint pass + you smoke-testing the app, since this sandbox's tooling can verify newly-created files reliably but not confirm a live `npm run dev` render.

## Questions before I execute

1. Affiliate — own `affiliate/` bucket, or folded into `company/`?
2. `CompanyLayout.jsx` — `shared/public/` or `company/public/`?
3. The duplicate `AdminClientInvoices.jsx` — investigate which is live and drop the other, or move both as-is for now?
4. `SimpleAddClientModal.jsx` / `RequireAdmin.jsx` — delete, or hold in a `_unused/` folder?
