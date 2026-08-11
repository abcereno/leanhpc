import React, { forwardRef } from "react";
import { useAuth } from "../../../context/AuthContext";
import eq from "../../../assets/equifax.svg";
import tu from "../../../assets/transunion.png";
import exp from "../../../assets/experian.png";
import car from "../../../assets/audit-assets/car.png";
import graph from "../../../assets/audit-assets/graph.png";
import handshake from "../../../assets/audit-assets/handshake.png";
import house from "../../../assets/audit-assets/house.png";
import lady from "../../../assets/audit-assets/lady.png";
import tablet from "../../../assets/audit-assets/tablet.png";

import { FaClock, FaCalendarAlt, FaMoneyBillWave, FaHistory, FaClipboardList, FaChartPie } from "react-icons/fa";

// Splitting items utility helper
const chunkArray = (array, size) => {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
};

const CreditAuditLayout = forwardRef(function CreditAuditLayout(inProps, ref) {
  const { printMode = false, ...rest } = inProps;
  const { adminName } = useAuth();

  // 👇 WHITELABEL FALLBACKS IMPLEMENTED HERE 👇
  const merged = {
    title: "Credit Analysis Report Prepared for",
    clientName: "Valued Client",
    clientAddress: "",
    clientDob: "",
    clientSsnLast4: "",
    createdDate: new Date().toISOString().split("T")[0],
    preparedBy: adminName || "",
    
    // Check for incoming custom company props, otherwise default to HPC
    companyName: inProps.companyName || "Hidden Partner Cloud",
    email: inProps.companyEmail || "info@hiddenpartnercloud.com",
    phone: inProps.companyPhone || "(919) 300-5202",
    website: inProps.companyWebsite || "https://hiddenpartnercloud.com",
    companyLogo: inProps.companyLogo || "https://storage.googleapis.com/msgsndr/rqr5oOzXxiHjh8wSS7T2/media/1923f793-9139-4710-acdf-be54468f86ab.png",

    scores: { exp: "—", tu: "—", eq: "—", avg: "—" },
    summary: {},
    utilization: {},
    bureauSummaries: [],
    derogatorySummary: { counts: {}, items: [] },
    publicRecords: [],
    inquiries: [],
    scoreFactors: [],
    speedUp: [],
    expertise: "While we cannot promise to remove all of the negative items...",
    planOfAction: "The credit system is flawed...",
    education: "We will be drafting many letters...",
    nextSteps: [
      "Log Into Your Secure Client Portal...",
      "Watch our 2-minute video.",
      "Provide a copy of your Photo ID...",
    ],
    expectations: [],
    closingIntro: "",
    closingNotes: [],
    comparisons: [],
    ...rest,
  };

  const {
    title, clientName, clientAddress, clientDob, clientSsnLast4, createdDate, preparedBy, email, phone, website,
    scores, bureauSummaries, utilization, derogatorySummary, publicRecords, inquiries, scoreFactors, nextSteps,
    expertise, planOfAction, speedUp, education, expectations, closingIntro, closingNotes, companyName, companyLogo,
  } = merged;

  const blockAttr = printMode ? { "data-block": "true" } : {};

  const theme = {
    bg: '#0B1121',
    cardBg: '#0f172a',
    border: '#1e293b',
    textMain: '#f8fafc',
    textMuted: '#94a3b8'
  };

  const derogatoryChunks = chunkArray(derogatorySummary.items || [], 8);
  const inquiryChunks = chunkArray(inquiries || [], 8);

  return (
    <div
      ref={ref}
      className={`credit-audit-layout-root mx-auto max-w-4xl ${printMode ? 'pt-2 pb-0 px-4' : 'mt-10 p-5'}`}
      style={{
        width: 794,
        boxSizing: "border-box",
        backgroundColor: theme.bg,
        color: theme.textMain,
        '--print-chunk-margin-top': printMode ? "35px" : "inherit",
        '--print-chunk-padding-x': printMode ? "10px" : "0px",
      }}
    >
      {/* Header page 1 */}
      <header {...blockAttr} data-section="header" className="mt-2 text-center">
        <div className="d-flex justify-content-center align-items-center mb-3" style={{ minHeight: '100px' }}>
          <img 
            src={companyLogo} 
            crossOrigin="anonymous" 
            alt={`${companyName} Logo`} 
            style={{ maxHeight: '100px', maxWidth: '280px', objectFit: 'contain' }} 
          />
        </div>
        <h6 className="uppercase tracking-wide text-sm fw-bold" style={{ color: theme.textMuted }}>{title}</h6>
        {clientName && <h1 className="m-0 text-2xl font-semibold" style={{ color: theme.textMain }}>{clientName}</h1>}
        {clientAddress && <div className="text-sm" style={{ color: theme.textMuted }}>{clientAddress}</div>}
        {(clientDob || clientSsnLast4) && (
          <div className="text-sm" style={{ color: theme.textMuted }}>
            {[clientDob && `DOB: ${clientDob}`, clientSsnLast4 && `SSN: •••• ${clientSsnLast4}`].filter(Boolean).join(" · ")}
          </div>
        )}
        {createdDate && <div className="text-sm mt-1" style={{ color: theme.textMuted }}>Created: {createdDate}</div>}

        <div className="d-flex justify-content-center mt-4">
          <img height={300} width={300} src={tablet} crossOrigin="anonymous" alt="Tablet" className="mb-2" />
        </div>

        {(preparedBy || email || phone) && (
          <div className="text-sm mt-3" style={{ color: theme.textMuted }}>
            {preparedBy && <p>Prepared by {preparedBy}, <strong style={{ color: theme.textMain }}>{companyName}</strong></p>}
            {[email, phone].filter(Boolean).length > 0 && <div>{[email, phone].filter(Boolean).join("   ")}</div>}
          </div>
        )}
      </header>

      {/* Welcome page 2 */}
      <section {...blockAttr} data-section="welcome" className="mt-5" style={{ color: theme.textMuted }}>
        <h2 className="text-xl font-semibold d-flex justify-content-center mb-4" style={{ color: theme.textMain }}>Welcome</h2>
        {clientName && <p style={{ color: theme.textMain }}>Dear {clientName},</p>}
        <p>This credit analysis report provides an overview of your credit as potential lenders see it today. It lists the items that are negatively affecting your score and explains how we use the law to improve your credit. It also includes a simple step-by-step plan to speed up the process.</p>
        <div className="my-4 p-4 rounded" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
          <div className="font-medium mb-2" style={{ color: theme.textMain }}>This report is broken down into 5 sections:</div>
          <ol className="list-decimal ml-6 m-0">
            <li>Credit Score Basics</li>
            <li>Your Credit Scores and Summary</li>
            <li>Analysis of Your Accounts</li>
            <li>An Overview of Our Process</li>
            <li>Your Part in the Process</li>
          </ol>
        </div>
        <p>If you have any questions, do not hesitate to reach out. We are always happy to help!</p>
        <p>You can easily reach us during regular business hours in the following ways:</p>
        <ul className="mb-4">
          <li><b style={{ color: theme.textMain }}>Email:</b> {email}</li>
          <li><b style={{ color: theme.textMain }}>Phone:</b> {phone}</li>
          <li><b style={{ color: theme.textMain }}>Website:</b> {website}</li>
        </ul>
        <p>{clientName}, thank you again for entrusting {companyName} to restore your credit. We are honored to help you achieve your financial goals.</p>
        <p className="mt-4 mb-1" style={{ color: theme.textMain }}>Best,</p>
        <p className="mb-1" style={{ color: theme.textMain }}>{adminName || "Your Specialist"}</p>
        <p style={{ color: theme.textMain }}>{companyName}</p>
      </section>

      {/* Score Impact (Camry) */}
      <section {...blockAttr} data-section="score-impact-comparison" className="text-center p-0 mt-5">
        <h2 className="m-0 h4 bg-primary text-white p-3 rounded-top">What a Low Credit Score Costs You</h2>
        <div className="p-4 border-bottom border-start border-end rounded-bottom" style={{ borderColor: `${theme.border} !important` }}>
          <img src={car} alt="Camry" className="img-fluid mb-3" style={{ maxWidth: '200px' }} />
          <h3 className="h5" style={{ color: theme.textMuted }}>New Toyota Camry: $23,000/66 Month Term</h3>
          <div className="row g-4 mt-3">
            <div className="col-md-6">
              <div className="card h-100" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textMain }}>
                <div className="card-body">
                  <h4 className="card-title h6" style={{ color: theme.textMuted }}>Jane's Credit Score</h4>
                  <p className="display-4 fw-bold text-success">730</p>
                  <ul className="list-group list-group-flush text-start">
                    <li className="list-group-item d-flex justify-content-between align-items-center" style={{ backgroundColor: 'transparent', borderColor: theme.border, color: theme.textMain }}>Interest Rate <span className="fw-bold">1.99%</span></li>
                    <li className="list-group-item d-flex justify-content-between align-items-center" style={{ backgroundColor: 'transparent', borderColor: theme.border, color: theme.textMain }}>Payment <span className="fw-bold">$368</span></li>
                  </ul>
                </div>
                <div className="card-footer text-white" style={{ backgroundColor: '#0f766e' }}><div className="text-uppercase small">Total Interest Paid</div><div className="h4 m-0">$1,302</div></div>
                <div className="card-footer text-white" style={{ backgroundColor: '#042f2e' }}><div className="text-uppercase small">Total Payments:</div><div className="h4 m-0">$24,302</div></div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="card h-100" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textMain }}>
                <div className="card-body">
                  <h4 className="card-title h6" style={{ color: theme.textMuted }}>John's Credit Score</h4>
                  <p className="display-4 fw-bold text-danger">599</p>
                  <ul className="list-group list-group-flush text-start">
                    <li className="list-group-item d-flex justify-content-between align-items-center" style={{ backgroundColor: 'transparent', borderColor: theme.border, color: theme.textMain }}>Interest Rate <span className="fw-bold">14.99%</span></li>
                    <li className="list-group-item d-flex justify-content-between align-items-center" style={{ backgroundColor: 'transparent', borderColor: theme.border, color: theme.textMain }}>Payment <span className="fw-bold">$514</span></li>
                  </ul>
                </div>
                <div className="card-footer text-white" style={{ backgroundColor: '#b91c1c' }}><div className="text-uppercase small">Total Interest Paid</div><div className="h4 m-0">$10,921</div></div>
                <div className="card-footer text-white" style={{ backgroundColor: '#7f1d1d' }}><div className="text-uppercase small">Total Payments:</div><div className="h4 m-0">$33,921</div></div>
              </div>
            </div>
          </div>
          <div className="p-4 mt-4 rounded" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
            <p className="h5" style={{ color: theme.textMain }}>A low score can cost you:</p>
            <p className="display-3 fw-bolder text-danger my-2">$9,616 MORE</p>
            <p className="h6" style={{ color: theme.textMuted }}>For the exact same car and price!</p>
          </div>
          <p className="fst-italic mt-4" style={{ color: theme.textMuted }}>This same thing happens with your credit cards, mortgage, loans, etc.</p>
        </div>
      </section>

      {/* Score Impact (House) */}
      <section {...blockAttr} data-section="score-impact-comparison-house" className="text-center mt-5">
        <div className="bg-primary text-white p-3 rounded-top">
          <h2 className="m-0 h4">What a Low Credit Score Costs You</h2>
        </div>
        <div className="p-4 border-bottom border-start border-end rounded-bottom" style={{ borderColor: `${theme.border} !important` }}>
          <img src={house} alt="New Home" className="img-fluid mb-3" style={{ maxWidth: "250px" }} />
          <h3 className="h5" style={{ color: theme.textMuted }}>New Home: $250,000/30 Year Fixed Rate Mortgage</h3>
          <div className="row g-4 mt-3">
            <div className="col-md-6">
              <div className="card h-100" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textMain }}>
                <div className="card-body">
                  <h4 className="card-title h6" style={{ color: theme.textMuted }}>Jane's Credit Score</h4>
                  <p className="display-4 fw-bold text-success">730</p>
                  <ul className="list-group list-group-flush text-start">
                    <li className="list-group-item d-flex justify-content-between align-items-center" style={{ backgroundColor: 'transparent', borderColor: theme.border, color: theme.textMain }}>Interest Rate <span className="fw-bold">2.75%</span></li>
                    <li className="list-group-item d-flex justify-content-between align-items-center" style={{ backgroundColor: 'transparent', borderColor: theme.border, color: theme.textMain }}>Payment <span className="fw-bold">$1,021</span></li>
                  </ul>
                </div>
                <div className="card-footer text-white" style={{ backgroundColor: '#0f766e' }}><div className="text-uppercase small">Total Interest Paid</div><div className="h4 m-0">$117,417</div></div>
                <div className="card-footer text-white" style={{ backgroundColor: '#042f2e' }}><div className="text-uppercase small">Total Payments:</div><div className="h4 m-0">$367,417</div></div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="card h-100" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textMain }}>
                <div className="card-body">
                  <h4 className="card-title h6" style={{ color: theme.textMuted }}>John's Credit Score</h4>
                  <p className="display-4 fw-bold text-danger">599</p>
                  <ul className="list-group list-group-flush text-start">
                    <li className="list-group-item d-flex justify-content-between align-items-center" style={{ backgroundColor: 'transparent', borderColor: theme.border, color: theme.textMain }}>Interest Rate <span className="fw-bold">6.5%</span></li>
                    <li className="list-group-item d-flex justify-content-between align-items-center" style={{ backgroundColor: 'transparent', borderColor: theme.border, color: theme.textMain }}>Payment <span className="fw-bold">$1,580</span></li>
                  </ul>
                </div>
                <div className="card-footer text-white" style={{ backgroundColor: '#b91c1c' }}><div className="text-uppercase small">Total Interest Paid</div><div className="h4 m-0">$318,861</div></div>
                <div className="card-footer text-white" style={{ backgroundColor: '#7f1d1d' }}><div className="text-uppercase small">Total Payments:</div><div className="h4 m-0">$568,861</div></div>
              </div>
            </div>
          </div>
          <div className="p-4 mt-4 rounded" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
            <p className="h5" style={{ color: theme.textMain }}>A low score can cost you:</p>
            <p className="display-3 fw-bolder text-danger my-2">$201,444 MORE</p>
            <p className="h6" style={{ color: theme.textMuted }}>For the exact same home & price!</p>
          </div>
          <p className="fst-italic mt-4" style={{ color: theme.textMuted }}>Cleaning up your credit will lower your bills and can save hundreds of thousands of dollars!</p>
        </div>
      </section>

      {/* Score Factors */}
      <section {...blockAttr} data-section="score-factors-visual" className="mt-5">
        <div className="bg-primary text-white p-3 rounded-top text-center">
          <h2 className="m-0 h4">How Credit Bureaus Determine your Credit Score</h2>
        </div>
        <div className="p-4 border-bottom border-start border-end rounded-bottom" style={{ borderColor: `${theme.border} !important` }}>
          <div className="p-3 rounded text-center mb-4" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
            <img src={graph} alt="Credit score factors donut chart" className="img-fluid" style={{ maxWidth: "350px" }} />
          </div>
          <h3 className="text-center my-4" style={{ color: theme.textMain }}>Your Behavior Affects Your Credit Score</h3>
          <div>
            <div className="d-flex align-items-start p-3 mb-3 rounded" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
              <FaCalendarAlt size={48} className="me-3 text-primary" />
              <div><h4 className="h6 fw-bold mb-1" style={{ color: theme.textMain }}>Do you pay your bills on time?</h4><p className="small m-0" style={{ color: theme.textMuted }}>Payment history is a major factor...</p></div>
            </div>
            <div className="d-flex align-items-start p-3 mb-3 rounded" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
              <FaMoneyBillWave size={48} className="me-3 text-primary" />
              <div><h4 className="h6 fw-bold mb-1" style={{ color: theme.textMain }}>What is your outstanding debt?</h4><p className="small m-0" style={{ color: theme.textMuted }}>It is important to not use all of your available credit...</p></div>
            </div>
            <div className="d-flex align-items-start p-3 mb-3 rounded" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
              <FaHistory size={48} className="me-3 text-primary" />
              <div><h4 className="h6 fw-bold mb-1" style={{ color: theme.textMain }}>Do you have a long credit history?</h4><p className="small m-0" style={{ color: theme.textMuted }}>Generally speaking, the longer your history...</p></div>
            </div>
            <div className="d-flex align-items-start p-3 mb-3 rounded" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
              <FaClipboardList size={48} className="me-3 text-primary" />
              <div><h4 className="h6 fw-bold mb-1" style={{ color: theme.textMain }}>Have you applied for credit recently?</h4><p className="small m-0" style={{ color: theme.textMuted }}>If you have many recent inquiries...</p></div>
            </div>
            <div className="d-flex align-items-start p-3 mb-3 rounded" style={{ backgroundColor: theme.cardBg, border: `1px solid ${theme.border}` }}>
              <FaChartPie size={48} className="me-3 text-primary" />
              <div><h4 className="h6 fw-bold mb-1" style={{ color: theme.textMain }}>What is your credit mix?</h4><p className="small m-0" style={{ color: theme.textMuted }}>Lenders like to see that you can manage different types of credit...</p></div>
            </div>
          </div>
        </div>
      </section>

      {/* Scores & Summary */}
      <section {...blockAttr} data-section="scores-summary-visual" className="mt-5">
        <div className="bg-primary text-white p-3 rounded-top text-center">
          <h2 className="m-0 h4">Your Credit Scores and Summary</h2>
          <p className="m-0 small">These scores were reported on {new Date().toLocaleDateString("en-US", { timeZone: "America/Los_Angeles" })}. Reports and scores refresh monthly.</p>
        </div>
        <div className="p-4 border-bottom border-start border-end rounded-bottom" style={{ borderColor: `${theme.border} !important` }}>
          <p className="text-center mb-4" style={{ color: theme.textMuted }}>We have analyzed your credit reports from the three major bureaus. Here are our findings.</p>
          <div className="row g-4">
            {(() => {
              const getScoreInfo = (score) => {
                const s = parseInt(score, 10);
                if (isNaN(s)) return { rating: "N/A", color: "text-muted" };
                if (s >= 740) return { rating: "Excellent", color: "text-success" };
                if (s >= 670) return { rating: "Good", color: "text-primary" };
                if (s >= 580) return { rating: "Fair", color: "text-warning" };
                return { rating: "Poor", color: "text-danger" };
              };
              const bureauDataMap = { Equifax: { score: scores.eq, logo: eq }, TransUnion: { score: scores.tu, logo: tu }, Experian: { score: scores.exp, logo: exp } };
              return bureauSummaries.map((bureauSummary) => {
                const bureauName = bureauSummary.bureau;
                const data = bureauDataMap[bureauName];
                if (!data) return null;
                const scoreInfo = getScoreInfo(data.score);
                return (
                  <div key={bureauName} className="col-4 mb-3">
                    <div className="card h-100" style={{ backgroundColor: theme.cardBg, borderColor: theme.border, color: theme.textMain }}>
                      <div className="card-body text-center">
                        <p className={`display-3 fw-bolder m-0 ${scoreInfo.color}`}>{data.score ?? "—"}</p>
                        <p className={`fw-bold ${scoreInfo.color}`}>{scoreInfo.rating}</p>
                      </div>
                      <div className="text-center py-2 bg-white rounded mx-3 mb-2"><img src={data.logo} alt={`${bureauName} logo`} className="img-fluid px-3" /></div>
                      <ul className="list-group list-group-flush small">
                        {[{ label: "Accounts", value: bureauSummary.accounts }, { label: "Inquiries", value: bureauSummary.inquiries }, { label: "Public Records", value: bureauSummary.publicRecords }, { label: "Collections", value: bureauSummary.collections }, { label: "Positive", value: bureauSummary.positive }, { label: "Negative", value: bureauSummary.negative }].map((item) => (
                          <li key={item.label} className="list-group-item d-flex justify-content-between align-items-center" style={{ backgroundColor: 'transparent', borderColor: theme.border, color: theme.textMain }}>
                            <span>{item.label}</span>
                            <span className={`badge rounded-pill ${item.label === "Negative" && item.value > 0 ? "bg-danger text-white" : "bg-secondary text-white"}`}>{item.value ?? 0}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
          {Array.isArray(scoreFactors) && scoreFactors.length > 0 && (
            <div className="card mt-4" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
              <div className="card-body">
                <h3 className="h5 card-title mb-3" style={{ color: theme.textMain }}>Key Factors Influencing Your Scores</h3>
                <ul className="list-group list-group-flush">
                  {scoreFactors.map((factor, i) => (
                    <li key={i} className="list-group-item px-0" style={{ backgroundColor: 'transparent', borderColor: theme.border, color: theme.textMuted }}>
                      <strong style={{ color: theme.textMain }}>{factor.question}</strong> {factor.note}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}
          <p className="text-center mt-4" style={{ color: theme.textMuted }}>Maxing out your credit cards will lower your score. If you pay balances down to below 30% of your available credit limit of each card, that will increase your score.</p>
          <div className="card mt-3" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
            <div className="card-body">
              <div className="row align-items-center">
                <div className="col-md-4 text-center"><p className="display-4 fw-bold text-primary m-0">{utilization?.percent || "N/A"}</p><p className="m-0" style={{ color: theme.textMuted }}>Credit Card Usage</p></div>
                <div className="col-md-8 text-center text-md-start mt-3 mt-md-0 border-md-start" style={{ borderColor: `${theme.border} !important` }}>
                  <div className="ps-md-3">
                    <p className="mb-1" style={{ color: theme.textMuted }}>Total available revolving credit: <span className="fw-bold" style={{ color: theme.textMain }}>{utilization?.available || "$0"}</span></p>
                    <p className="m-0" style={{ color: theme.textMuted }}>Current credit card balance: <span className="fw-bold" style={{ color: theme.textMain }}>{utilization?.balance || "$0"}</span></p>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <div className="text-center mt-4"><h3 className="h5 fw-bold" style={{ color: theme.textMain }}>It Is Important To Keep Your Credit Monitoring Account Active Throughout The Credit Repair Process</h3><p className="small" style={{ color: theme.textMuted }}>Credit scores vary depending on where you get them...</p></div>
        </div>
      </section>

      {/* Derogatory Base Block Wrapper */}
      <section {...(!printMode ? blockAttr : {})} data-section="derogatory-visual" className="mt-5">
        <div className="bg-primary text-white p-3 rounded-top text-center"><h2 className="m-0 h4">Derogatory Summary</h2></div>
        <div className="p-4 border-bottom border-start border-end rounded-bottom mb-4" style={{ borderColor: `${theme.border} !important` }}>
          <p className="mb-4" style={{ color: theme.textMuted }}>We analyzed all the items on your reports to determine which accounts are negatively impacting your score. Here are our findings.</p>
          <div className="table-responsive">
            <table className="table table-dark table-borderless">
              <thead style={{ borderBottom: `2px solid ${theme.border}` }}><tr className="text-center"><th className="text-start"></th><th className="bg-white rounded m-1"><img src={eq} alt="Equifax" style={{ height: "20px" }} /></th><th className="bg-white rounded m-1"><img src={tu} alt="TransUnion" style={{ height: "20px" }} /></th><th className="bg-white rounded m-1"><img src={exp} alt="Experian" style={{ height: "20px" }} /></th></tr></thead>
              <tbody className="text-center">
                {Object.entries({ Delinquent: derogatorySummary.counts?.delinquent, Derogatory: derogatorySummary.counts?.derogatory, Collections: derogatorySummary.counts?.collection, "Public Records": derogatorySummary.counts?.publicRecords, "Inquiries (2 years)": derogatorySummary.counts?.inquiries2yr }).map(([label, data]) => (
                  <tr key={label} style={{ borderBottom: `1px solid ${theme.border}` }}><td className="text-start fw-bold" style={{ color: theme.textMain }}>{label}</td><td style={{ color: theme.textMuted }}>{data?.Equifax ?? 0}</td><td style={{ color: theme.textMuted }}>{data?.TransUnion ?? 0}</td><td style={{ color: theme.textMuted }}>{data?.Experian ?? 0}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {derogatoryChunks.map((chunk, chunkIdx) => (
        <section 
          key={`derog-chunk-${chunkIdx}`} 
          {...blockAttr} 
          className="print-chunk-margin"
          style={{ contentVisibility: "auto" }}
        >
          <div className="bg-primary text-white p-3 rounded-top text-center" style={{ marginLeft: printMode ? "12px" : "0", marginRight: printMode ? "12px" : "0" }}>
            <h2 className="m-0 h4">Derogatory Items {derogatoryChunks.length > 1 ? `(Part ${chunkIdx + 1})` : ""}</h2>
          </div>
          <div className="p-4 border-bottom border-start border-end rounded-bottom bg-transparent" style={{ borderColor: `${theme.border} !important`, marginLeft: printMode ? "12px" : "0", marginRight: printMode ? "12px" : "0" }}>
            {chunkIdx === 0 && (
              <div className="card mb-4" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}><div className="card-body"><div className="row align-items-center"><div className="col-md-3 text-center"><p className="display-3 fw-bold text-danger m-0">{derogatorySummary.items.length}</p><p className="fw-bold m-0" style={{ color: theme.textMuted }}>Delinquent or derogatory items</p></div><div className="col-md-9"><p className="small m-0" style={{ color: theme.textMuted }}>Recent late payments, collections, and other derogatory items within the last 6 months will hurt your credit score...</p></div></div></div></div>
            )}
            <div className="table-responsive">
              <table className="table table-dark table-bordered align-middle" style={{ borderColor: theme.border, marginBottom: "0" }}>
                <thead style={{ backgroundColor: theme.cardBg }}><tr className="text-center"><th className="text-start">Account Name</th><th className="bg-white rounded"><img src={eq} alt="Equifax" style={{ height: "18px" }} /></th><th className="bg-white rounded"><img src={tu} alt="TransUnion" style={{ height: "18px" }} /></th><th className="bg-white rounded"><img src={exp} alt="Experian" style={{ height: "18px" }} /></th><th className="text-start">Issue</th></tr></thead>
                <tbody>
                  {chunk.map((item, i) => {
                    const BureauCell = ({ name }) => {
                      const active = Array.isArray(item.bureaus) && item.bureaus.includes(name);
                      return active ? <span className="text-danger fw-bold">X <small style={{ color: theme.textMuted }}>Negative</small></span> : <span>—</span>;
                    };
                    return (<tr key={i}><td className="fw-bold text-start" style={{ color: theme.textMain }}>{item.accountName || item.account || "N/A"}</td><td className="text-center"><BureauCell name="Equifax" /></td><td className="text-center"><BureauCell name="TransUnion" /></td><td className="text-center"><BureauCell name="Experian" /></td><td className="text-start" style={{ color: theme.textMuted }}>{item.issue || item.notes || "N/A"}</td></tr>);
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ))}

      {/* Public Records */}
      <section {...blockAttr} data-section="public-records-visual" className="mt-5">
        <div className="bg-primary text-white p-3 rounded-top text-center" style={{ marginLeft: printMode ? "12px" : "0", marginRight: printMode ? "12px" : "0" }}><h2 className="m-0 h4">Public Records</h2></div>
        <div className="p-4 border-bottom border-start border-end rounded-bottom" style={{ borderColor: `${theme.border} !important`, marginLeft: printMode ? "12px" : "0", marginRight: printMode ? "12px" : "0" }}>
          <div className="card mb-4" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}><div className="card-body"><div className="row align-items-center"><div className="col-md-3 text-center"><p className="display-5 fw-bold text-primary m-0">{publicRecords?.length > 0 ? publicRecords.length : "zero"}</p><p style={{ color: theme.textMuted }}>Public Records</p></div><div className="col-md-9"><p className="m-0" style={{ color: theme.textMuted }}>Public records include details of court records...</p></div></div></div></div>
          <div className="table-responsive">
            <table className="table table-dark table-borderless">
              <thead style={{ borderBottom: `2px solid ${theme.border}` }}><tr className="align-middle"><th className="text-start">Account Name</th><th className="text-center bg-white rounded"><img src={eq} alt="Equifax" style={{ height: "15px" }} /></th><th className="text-center bg-white rounded"><img src={tu} alt="TransUnion" style={{ height: "15px" }} /></th><th className="text-center bg-white rounded"><img src={exp} alt="Experian" style={{ height: "15px" }} /></th><th className="text-start">Issue</th></tr></thead>
              <tbody>
                {!publicRecords || publicRecords.length === 0 ? <tr><td colSpan="5" className="text-center py-4" style={{ color: theme.textMuted }}>No Record Found.</td></tr> : publicRecords.map((record, index) => {
const BureauStatus = ({ bureauName }) => (record.bureaus && record.bureaus.includes(bureauName)) || (record.bureau && record.bureau.includes(bureauName)) ? <span className="text-danger fw-bold">✗</span> : <span>—</span>;                  return <tr key={index} className="align-middle" style={{ borderBottom: `1px solid ${theme.border}` }}><td className="fw-bold" style={{ color: theme.textMain }}>{record.accountName || record.type || "Record"}</td><td className="text-center"><BureauStatus bureauName="Equifax" /></td><td className="text-center"><BureauStatus bureauName="TransUnion" /></td><td className="text-center"><BureauStatus bureauName="Experian" /></td><td style={{ color: theme.textMuted }}>{record.issue || record.detail || record.status || "On file"}</td></tr>;
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {inquiryChunks.map((chunk, chunkIdx) => (
        <section 
          key={`inq-chunk-${chunkIdx}`} 
          {...blockAttr} 
          className="print-chunk-margin"
          style={{ contentVisibility: "auto" }}
        >
          <div className="bg-primary text-white p-3 rounded-top text-center" style={{ marginLeft: printMode ? "12px" : "0", marginRight: printMode ? "12px" : "0" }}>
            <h2 className="m-0 h4">Inquiries {inquiryChunks.length > 1 ? `(Part ${chunkIdx + 1})` : ""}</h2>
          </div>
          <div className="p-4 border-bottom border-start border-end rounded-bottom bg-transparent" style={{ borderColor: `${theme.border} !important`, marginLeft: printMode ? "12px" : "0", marginRight: printMode ? "12px" : "0" }}>
            {chunkIdx === 0 && (
              <div className="card mb-4" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}>
                <div className="card-body">
                  <div className="row align-items-center">
                    <div className="col-md-3 text-center"><p className="display-3 fw-bold text-primary m-0">{inquiries?.length || 0}</p><p style={{ color: theme.textMuted }}>Inquiries</p></div>
                    <div className="col-md-9"><p className="m-0" style={{ color: theme.textMuted }}>Each time you apply for credit it lowers your score. For that reason we ask during credit repair that you do not apply for anything.</p></div>
                  </div>
                </div>
              </div>
            )}
            <div className="table-responsive">
              <table className="table table-dark table-borderless" style={{ marginBottom: "0" }}>
                <thead style={{ borderBottom: `2px solid ${theme.border}` }}>
                  <tr className="align-middle">
                    <th className="text-start">Account Name</th>
                    <th className="text-center bg-white rounded"><img src={eq} alt="Equifax" style={{ height: "15px" }} /></th>
                    <th className="text-center bg-white rounded"><img src={tu} alt="TransUnion" style={{ height: "15px" }} /></th>
                    <th className="text-center bg-white rounded"><img src={exp} alt="Experian" style={{ height: "15px" }} /></th>
                    <th className="text-start">Issue</th>
                  </tr>
                </thead>
                <tbody>
                  {chunk.map((inquiry, index) => {
                    const BureauStatus = ({ bureauName }) => {
                      let colCode = "UNK";
                      if (bureauName === "Equifax") colCode = "EQ";
                      if (bureauName === "TransUnion") colCode = "TU";
                      if (bureauName === "Experian") colCode = "EX";

                      let inqCode = "UNK";
                      const rawBureau = (inquiry.bureau || "").toUpperCase();
                      if (rawBureau.includes("EQUI") || rawBureau === "EQ") inqCode = "EQ";
                      if (rawBureau.includes("TRANS") || rawBureau === "TU") inqCode = "TU";
                      if (rawBureau.includes("EXP") || rawBureau === "EX") inqCode = "EX";

                      if (inqCode === colCode) {
                        let formattedDate = "";
                        if (inquiry.date && inquiry.date !== "Unknown") {
                            const d = new Date(inquiry.date);
                            if (!isNaN(d.getTime())) {
                                formattedDate = d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
                            }
                        }
                        return (<div className="text-danger"><span className="fw-bold d-block">X</span><span className="small">{formattedDate}</span></div>);
                      }
                      return <span>—</span>;
                    };

                    return (
                      <tr key={index} className="align-middle" style={{ borderBottom: `1px solid ${theme.border}` }}>
                        <td className="fw-bold" style={{ color: theme.textMain }}>{inquiry.name || inquiry.creditor || "N/A"}</td>
                        <td className="text-center"><BureauStatus bureauName="Equifax" /></td>
                        <td className="text-center"><BureauStatus bureauName="TransUnion" /></td>
                        <td className="text-center"><BureauStatus bureauName="Experian" /></td>
                        <td style={{ color: theme.textMuted }}>{inquiry.label || "Inquiry"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      ))}

      {/* Process & Next Steps */}
      <section {...blockAttr} data-section="process-and-next-steps" className="mt-5">
        {expertise && (<div><h2 className="h4 fw-bold" style={{ color: theme.textMain }}>We Are Experts In Disputing The Errors On Your Report That Lower Your Score.</h2><p style={{ color: theme.textMuted }}>{expertise}</p></div>)}
        {planOfAction && (<div className="mt-4"><h2 className="h4 fw-bold" style={{ color: theme.textMain }}>Our Plan Of Action</h2><p style={{ color: theme.textMuted }}>{planOfAction}</p></div>)}
        {education && (<div className="mt-4"><h2 className="h4 fw-bold" style={{ color: theme.textMain }}>We Provide Document Preparation And Credit Education</h2><p style={{ color: theme.textMuted }}>{education}</p></div>)}
        <div className="text-center my-4"><img src={lady} alt="Client working at a desk" className="img-fluid rounded" style={{ maxWidth: "350px", border: `1px solid ${theme.border}` }} /></div>
        {Array.isArray(nextSteps) && nextSteps.length > 0 && (
          <div><h2 className="h4 fw-bold mb-3" style={{ color: theme.textMain }}>Your Part In The Process</h2><div className="card" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}><div className="card-body"><h3 className="h5 card-title mb-3" style={{ color: theme.textMain }}>Your Next Steps</h3><ul className="list-unstyled">{nextSteps.map((step, index) => (<li key={index} className="d-flex align-items-start mb-3"><div className="d-flex align-items-center justify-content-center fw-bold text-white bg-primary rounded-circle me-3" style={{ width: "2rem", height: "2rem", flexShrink: 0 }}>{index + 1}</div><span className="pt-1" style={{ color: theme.textMuted }}>{step}</span></li>))}</ul></div></div></div>
        )}
      </section>

      {/* Speed Up & Expectations */}
      <section {...blockAttr} data-section="speed-up-and-expectations" className="mt-5">
        {Array.isArray(speedUp) && speedUp.length > 0 && (<div className="card mb-4" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}><div className="card-body"><h2 className="h4 fw-bold card-title mb-3" style={{ color: theme.textMain }}>How You Can Speed Up The Process</h2><ul className="list-unstyled">{speedUp.map((step, index) => (<li key={index} className="d-flex align-items-start mb-3"><div className="d-flex align-items-center justify-content-center fw-bold text-white bg-primary rounded-circle me-3" style={{ width: "2rem", height: "2rem", flexShrink: 0 }}>{index + 1}</div><span className="pt-1" style={{ color: theme.textMuted }}>{step}</span></li>))}</ul></div></div>)}
        {Array.isArray(expectations) && expectations.length > 0 && (<div className="card" style={{ backgroundColor: theme.cardBg, borderColor: theme.border }}><div className="card-body"><div className="row align-items-center"><div className="col-md-2 text-center"><FaClock size={64} className="text-primary" /></div><div className="col-md-10"><h2 className="h4 fw-bold" style={{ color: theme.textMain }}>This Process Takes Time</h2>{expectations.map((paragraph, index) => (<p key={index} className="mb-2" style={{ color: theme.textMuted }}>{paragraph}</p>))}</div></div></div></div>)}
      </section>

      {/* Closing */}
      <section {...blockAttr} data-section="closing" className="mt-5 border-top pt-4" style={{ borderColor: `${theme.border} !important` }}>
        <h2 className="h4 fw-bold" style={{ color: theme.textMain }}>So Let's Get Started!</h2>
        {closingIntro && <p style={{ color: theme.textMuted }}>{closingIntro}</p>}
        <div className="text-center my-4"><img src={handshake} alt="Handshake agreement" className="img-fluid rounded" style={{ maxWidth: "350px", border: `1px solid ${theme.border}` }} /></div>
        {Array.isArray(closingNotes) && closingNotes.length > 0 && (<div className="mt-3">{closingNotes.map((note, index) => (<p key={index} style={{ color: theme.textMuted }}>{note}</p>))}</div>)}
        {(email || phone || website) && (<div className="mt-4" style={{ color: theme.textMuted }}>{email && (<p className="mb-1"><strong className="me-2" style={{ color: theme.textMain }}>Email:</strong>{email}</p>)}{phone && (<p className="mb-1"><strong className="me-2" style={{ color: theme.textMain }}>Phone:</strong>{phone}</p>)}{website && (<p className="mb-1"><strong className="me-2" style={{ color: theme.textMain }}>Website:</strong>{website}</p>)}</div>)}
      </section>
    </div>
  );
});

export default CreditAuditLayout;