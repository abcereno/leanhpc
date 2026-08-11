// import React from "react";

// /**
//  * CreditAuditLayout
//  *
//  * Purpose: Replicates the logical layout / display block order of the provided PDF.
//  * Styling: Minimal utility classes only so you can reposition and redesign freely.
//  * Usage: <CreditAuditLayout {...props} />
//  */

// export default function CreditAuditLayout(props) {
//   const {
//     // Block 1 – Header
//     title = "Credit Audit Report Prepared for",
//     clientName = "Client Name",
//     createdDate = "MM/DD/YYYY",
//     preparedBy = "Your Name, Your Company",
//     email = "email@example.com",
//     phone = "(000) 000-0000",
//     website = "your-website.com",

//     // Block 3 – Educational Comparisons (Car, Home, etc.)
//     comparisons = [
//       {
//         heading: "What a Low Credit Score Costs You",
//         subtitle: "New Toyota Camry: $23,000 / 66 Month Term",
//         items: [
//           {
//             label: "Jane's Credit Score",
//             score: "730",
//             interestRate: "1.99%",
//             payment: "$368",
//             totalInterest: "$1,302",
//             totalPayments: "$24,302",
//           },
//           {
//             label: "John's Credit Score",
//             score: "599",
//             interestRate: "14.99%",
//             payment: "$514",
//             totalInterest: "$10,921",
//             totalPayments: "$33,921",
//           },
//         ],
//         differenceNote: "$9,616 MORE for the exact same car and price!",
//       },
//       {
//         heading: "What a Low Credit Score Costs You",
//         subtitle: "New Home: $250,000 / 30 Year Fixed Rate Mortgage",
//         items: [
//           {
//             label: "Jane's Credit Score",
//             score: "730",
//             interestRate: "2.75%",
//             payment: "$1,021",
//             totalInterest: "$117,417",
//             totalPayments: "$367,417",
//           },
//           {
//             label: "John's Credit Score",
//             score: "599",
//             interestRate: "6.5%",
//             payment: "$1,580",
//             totalInterest: "$318,861",
//             totalPayments: "$568,861",
//           },
//         ],
//         differenceNote: "$201,444 MORE for exact same home & price!",
//       },
//     ],

//     // Block 4 – Score Factors
//     scoreFactors = [
//       {
//         question: "Do you pay your bills on time?",
//         note:
//           "Payment history is a major factor. Late pays, collections, or bankruptcy hurt your score.",
//       },
//       {
//         question: "Do you have a long credit history?",
//         note: "Longer account history generally improves trust as a borrower.",
//       },
//       {
//         question: "Have you applied for credit recently?",
//         note:
//           "Many recent inquiries can be negative. Apply only when necessary.",
//       },
//       {
//         question: "What is your outstanding debt?",
//         note:
//           "Avoid maxing out revolving credit. High utilization signals poor debt management.",
//       },
//     ],

//     // Block 5 – Three-Bureau Summary
//     bureauSummaries = [
//       {
//         bureau: "Experian",
//         accounts: 12,
//         inquiries: 0,
//         publicRecords: 0,
//         collections: 0,
//         positive: 6,
//         negative: 0,
//       },
//       {
//         bureau: "TransUnion",
//         accounts: 7,
//         inquiries: 4,
//         publicRecords: 0,
//         collections: 0,
//         positive: 2,
//         negative: 0,
//       },
//       {
//         bureau: "Equifax",
//         accounts: 7,
//         inquiries: 0,
//         publicRecords: 0,
//         collections: 0,
//         positive: 2,
//         negative: 0,
//       },
//     ],
//     utilization = {
//       utilizationNote:
//         "Maxing out your credit cards lowers your score. Pay balances below 30% of each card's limit.",
//       percent: "10%",
//       available: "$603",
//       balance: "$56",
//       monitorReminder:
//         "Keep credit monitoring active throughout the process for accurate baseline tracking.",
//     },

//     // Block 6 – Derogatory Summary
//     derogatorySummary = {
//       counts: {
//         delinquent: { Experian: 1, TransUnion: 1, Equifax: 1 },
//         derogatory: { Experian: 1, TransUnion: 1, Equifax: 0 },
//         collection: { Experian: 0, TransUnion: 0, Equifax: 0 },
//         publicRecords: { Experian: 0, TransUnion: 0, Equifax: 0 },
//         inquiries2yr: { Experian: 0, TransUnion: 4, Equifax: 0 },
//       },
//       items: [
//         { accountName: "SELFINC/LEAD", issue: "Negative; 30 & 60 days late" },
//         { accountName: "SELF / LEAD", issue: "Negative; 30 days late" },
//         { accountName: "5/3 BANK NA", issue: "Negative; 30 days late" },
//         { accountName: "DOMENGYNCG", issue: "Derogatory; collection; charged off" },
//         { accountName: "CB/VICSCRT", issue: "Collection; charged off" },
//         { accountName: "FST PREMIER", issue: "Negative; 30 days late (3x)" },
//         { accountName: "STATE EMPLOYEES CU/PSC", issue: "Negative; 30 & 60 days late" },
//       ],
//     },

//     // Block 7 – Public Records
//     publicRecords = [], // { accountName, issue }

//     // Block 8 – Inquiries
//     inquiries = [
//       { name: "CROSSCOUNTRY", date: "09/08/2022", label: "Inquiry" },
//       { name: "RAPID MORTGA", date: "06/21/2021", label: "Inquiry" },
//       { name: "CREDIT PLUS", date: "03/19/2021", label: "Inquiry" },
//       { name: "CREDIT PLUS", date: "01/26/2021", label: "Inquiry" },
//     ],

//     // Block 9 – Company Statement & Plan
//     expertise =
//       "We are experts at disputing report errors that lower your score. While no one can promise removals, we use the law in your favor and maintain a strong track record.",
//     planOfAction =
//       "The law allows you to dispute any item. If it cannot be verified, it must be removed. We send targeted dispute letters to bureaus and furnishers.",
//     education =
//       "We prepare documents and provide credit education so you can keep your improved credit long after our work is done.",

//     // Block 10 – Client Instructions
//     nextSteps = [
//       "Log into your secure client portal (login details provided via email).",
//       "Watch our quick 2-minute video.",
//       "Upload Photo ID and a recent bill top-section as proof of address.",
//     ],
//     speedUp = [
//       "Avoid applying for new credit.",
//       "Do not close existing accounts.",
//       "Pay cards down below 30% of each limit and keep them there.",
//       "Always pay on time.",
//       "Keep your monitoring account active and share access with us.",
//       "Open all mail and upload bureau replies to your portal.",
//     ],

//     // Block 11 – Expectations
//     expectations = [
//       "Responses to each round take ~30–45 days. We phase disputes to avoid 'frivolous' rejections.",
//       "Tough items may require multiple letters over several cycles.",
//       "You’ll receive progress updates via the portal as we work.",
//     ],

//     // Block 12 – Closing
//     closingIntro =
//       "So let’s get started! Reach out so we can complete sign-up and activate your portal (if not already).",
//     closingNotes = [
//       "Our contact info is in all emails and on our website. You can also send secure portal messages.",
//       "We appreciate you choosing us and look forward to helping you improve your credit and financial future!",
//     ],
//   } = props;

//   return (
//     <div className="mx-auto max-w-4xl p-6 space-y-10">
//       {/* Block 1 – Header */}
//       <header className="space-y-2">
//         <img src="https://storage.googleapis.com/msgsndr/rqr5oOzXxiHjh8wSS7T2/media/1923f793-9139-4710-acdf-be54468f86ab.png" alt="LT Outsourcing Logo" />
//         <h1 className="text-2xl font-semibold">{title}</h1>
//         <div className="text-lg font-medium">{clientName}</div>
//         <div className="text-sm text-gray-500">Created: {createdDate}</div>
//         <div className="text-sm">Prepared by {preparedBy}</div>
//         <div className="text-sm">{email} · {phone}</div>
//         <div className="text-sm">{website}</div>
//       </header>

//       {/* Block 2 – Welcome Letter */}
//       <section className="space-y-3">
//         <h2 className="text-xl font-semibold">Welcome</h2>
//         <p>Dear {clientName},</p>
//         <p>
//           On behalf of our team, welcome! This analysis provides a snapshot of your credit as lenders see it, highlights score
//           impacts, and outlines how we’ll help you improve your profile—plus your simple next steps.
//         </p>
//         <div>
//           <div className="font-medium">This report is broken down into 5 sections:</div>
//           <ol className="list-decimal ml-6">
//             <li>Credit Score Basics</li>
//             <li>Your Credit Scores and Summary</li>
//             <li>Analysis of Your Accounts</li>
//             <li>An Overview of Our Process</li>
//             <li>Your Part in the Process</li>
//           </ol>
//         </div>
//         <div className="text-sm">
//           Email: {email} · Phone: {phone} · Website: {website}
//         </div>
//         <div className="text-sm">Best,</div>
//         <div className="text-sm font-medium">{preparedBy}</div>
//       </section>

//       {/* Block 3 – Educational Comparisons */}
//       {comparisons?.map((cmp, idx) => (
//         <section key={idx} className="space-y-3">
//           <h2 className="text-xl font-semibold">{cmp.heading}</h2>
//           {cmp.subtitle && <div className="text-sm text-gray-600">{cmp.subtitle}</div>}
//           <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
//             {cmp.items?.map((it, i) => (
//               <div key={i} className="border p-3 rounded-md">
//                 <div className="font-medium">{it.label}</div>
//                 <div className="text-2xl font-semibold">{it.score}</div>
//                 <ul className="text-sm mt-2 space-y-1">
//                   <li>Interest Rate: {it.interestRate}</li>
//                   <li>Payment: {it.payment}</li>
//                   <li>Total Interest Paid: {it.totalInterest}</li>
//                   <li>Total Payments: {it.totalPayments}</li>
//                 </ul>
//               </div>
//             ))}
//           </div>
//           {cmp.differenceNote && (
//             <div className="text-sm font-medium">{cmp.differenceNote}</div>
//           )}
//         </section>
//       ))}

//       {/* Block 4 – Score Factors */}
//       <section className="space-y-3">
//         <h2 className="text-xl font-semibold">How Credit Bureaus Determine Your Credit Score</h2>
//         <div className="space-y-2">
//           {scoreFactors?.map((f, i) => (
//             <div key={i}>
//               <div className="font-medium">{f.question}</div>
//               <div className="text-sm text-gray-700">{f.note}</div>
//             </div>
//           ))}
//         </div>
//       </section>

//       {/* Block 5 – Your Credit Scores and Summary */}
//       <section className="space-y-3">
//         <h2 className="text-xl font-semibold">Your Credit Scores and Summary</h2>
//         <p className="text-sm text-gray-700">
//           These figures reflect your latest monitoring report. Counts and statuses by bureau:
//         </p>
//         <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
//           {bureauSummaries?.map((b, i) => (
//             <div key={i} className="border p-3 rounded-md">
//               <div className="font-medium">{b.bureau}</div>
//               <ul className="text-sm mt-2 space-y-1">
//                 <li>Accounts: {b.accounts}</li>
//                 <li>Inquiries: {b.inquiries}</li>
//                 <li>Public Records: {b.publicRecords}</li>
//                 <li>Collections: {b.collections}</li>
//                 <li>Positive: {b.positive}</li>
//                 <li>Negative: {b.negative}</li>
//               </ul>
//             </div>
//           ))}
//         </div>
//         <div className="border p-3 rounded-md">
//           <div className="text-sm">{utilization.utilizationNote}</div>
//           <div className="mt-2 text-sm">
//             <span className="font-medium">Credit Card Usage:</span> {utilization.percent}
//           </div>
//           <div className="text-sm">Total available revolving credit: {utilization.available}</div>
//           <div className="text-sm">Current credit card balance: {utilization.balance}</div>
//           <div className="text-sm mt-2">{utilization.monitorReminder}</div>
//         </div>
//       </section>

//       {/* Block 6 – Derogatory Summary */}
//       <section className="space-y-3">
//         <h2 className="text-xl font-semibold">Derogatory Summary</h2>
//         <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-sm">
//           <div className="border p-3 rounded-md">
//             <div className="font-medium mb-1">Delinquent</div>
//             <div>Experian: {derogatorySummary.counts.delinquent.Experian}</div>
//             <div>TransUnion: {derogatorySummary.counts.delinquent.TransUnion}</div>
//             <div>Equifax: {derogatorySummary.counts.delinquent.Equifax}</div>
//           </div>
//           <div className="border p-3 rounded-md">
//             <div className="font-medium mb-1">Derogatory</div>
//             <div>Experian: {derogatorySummary.counts.derogatory.Experian}</div>
//             <div>TransUnion: {derogatorySummary.counts.derogatory.TransUnion}</div>
//             <div>Equifax: {derogatorySummary.counts.derogatory.Equifax}</div>
//           </div>
//           <div className="border p-3 rounded-md">
//             <div className="font-medium mb-1">Collections</div>
//             <div>Experian: {derogatorySummary.counts.collection.Experian ?? 0}</div>
//             <div>TransUnion: {derogatorySummary.counts.collection.TransUnion ?? 0}</div>
//             <div>Equifax: {derogatorySummary.counts.collection.Equifax ?? 0}</div>
//           </div>
//           <div className="border p-3 rounded-md">
//             <div className="font-medium mb-1">Public Records</div>
//             <div>Experian: {derogatorySummary.counts.publicRecords.Experian}</div>
//             <div>TransUnion: {derogatorySummary.counts.publicRecords.TransUnion}</div>
//             <div>Equifax: {derogatorySummary.counts.publicRecords.Equifax}</div>
//           </div>
//           <div className="border p-3 rounded-md">
//             <div className="font-medium mb-1">Inquiries (2 years)</div>
//             <div>Experian: {derogatorySummary.counts.inquiries2yr.Experian}</div>
//             <div>TransUnion: {derogatorySummary.counts.inquiries2yr.TransUnion}</div>
//             <div>Equifax: {derogatorySummary.counts.inquiries2yr.Equifax}</div>
//           </div>
//         </div>
//         <div className="space-y-2">
//           <div className="font-medium">Derogatory Items</div>
//           <ul className="list-disc ml-6 text-sm space-y-1">
//             {derogatorySummary.items?.map((d, i) => (
//               <li key={i}>
//                 <span className="font-medium">{d.accountName}:</span> {d.issue}
//               </li>
//             ))}
//           </ul>
//         </div>
//       </section>

//       {/* Block 7 – Public Records */}
//       <section className="space-y-3">
//         <h2 className="text-xl font-semibold">Public Records</h2>
//         {publicRecords && publicRecords.length > 0 ? (
//           <ul className="list-disc ml-6 text-sm space-y-1">
//             {publicRecords.map((r, i) => (
//               <li key={i}>
//                 <span className="font-medium">{r.accountName}:</span> {r.issue}
//               </li>
//             ))}
//           </ul>
//         ) : (
//           <div className="text-sm">No Record Found.</div>
//         )}
//       </section>

//       {/* Block 8 – Inquiries */}
//       <section className="space-y-3">
//         <h2 className="text-xl font-semibold">Inquiries</h2>
//         <p className="text-sm text-gray-700">
//           Each time you apply for credit it may lower your score. Please avoid new applications during processing.
//         </p>
//         <div className="text-sm">
//           {inquiries?.map((q, i) => (
//             <div key={i} className="border p-3 rounded-md mb-2">
//               <div className="font-medium">{q.name}</div>
//               <div>{q.date} · {q.label}</div>
//             </div>
//           ))}
//         </div>
//       </section>

//       {/* Block 9 – Company Statement & Plan */}
//       <section className="space-y-3">
//         <h2 className="text-xl font-semibold">We Are Experts in Disputing the Errors on Your Report</h2>
//         <p className="text-sm">{expertise}</p>
//         <div>
//           <div className="font-medium">Our Plan Of Action</div>
//           <p className="text-sm">{planOfAction}</p>
//         </div>
//         <div>
//           <div className="font-medium">We Provide Document Preparation And Credit Education</div>
//           <p className="text-sm">{education}</p>
//         </div>
//       </section>

//       {/* Block 10 – Client Instructions */}
//       <section className="space-y-3">
//         <h2 className="text-xl font-semibold">Your Part in the Process</h2>
//         <div>
//           <div className="font-medium">Your Next Steps</div>
//           <ol className="list-decimal ml-6 text-sm space-y-1">
//             {nextSteps?.map((s, i) => (
//               <li key={i}>{s}</li>
//             ))}
//           </ol>
//         </div>
//         <div>
//           <div className="font-medium">How You Can Speed Up The Process</div>
//           <ul className="list-disc ml-6 text-sm space-y-1">
//             {speedUp?.map((s, i) => (
//               <li key={i}>{s}</li>
//             ))}
//           </ul>
//         </div>
//       </section>

//       {/* Block 11 – Expectations */}
//       <section className="space-y-3">
//         <h2 className="text-xl font-semibold">This Process Takes Time</h2>
//         <ul className="list-disc ml-6 text-sm space-y-1">
//           {expectations?.map((e, i) => (
//             <li key={i}>{e}</li>
//           ))}
//         </ul>
//       </section>

//       {/* Block 12 – Closing */}
//       <section className="space-y-3">
//         <h2 className="text-xl font-semibold">Next Steps & Contact</h2>
//         <p className="text-sm">{closingIntro}</p>
//         <ul className="list-disc ml-6 text-sm space-y-1">
//           {closingNotes?.map((c, i) => (
//             <li key={i}>{c}</li>
//           ))}
//         </ul>
//         <div className="text-sm">Email: {email} · Phone: {phone} · Website: {website}</div>
//       </section>
//     </div>
//   );
// }
