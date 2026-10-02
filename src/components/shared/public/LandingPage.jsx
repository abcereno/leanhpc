import React from "react";
import { Link } from "react-router-dom";
import "./hpcTheme.css";
import "./LandingPage.css";
import Cloud1 from "../../../assets/cloud1.png";
import HpcNav, { SIGNUP_ROUTE, PRICING_URL } from "./HpcNav";
import HpcFooter from "./HpcFooter";

// Rebuilt 2026-10-02 to match the "Hidden Partner Cloud" broker-pitch
// design reviewed from the public artifact
// (claude.ai/artifact/1zqtK4sKRSVhVzLe8QVUHF) — replaces the previous
// light "all-in-one admin cloud" landing page entirely, per explicit
// instruction, except for the hero's animated floating-cloud background
// (Cloud1.png + cloudCircle keyframes), which is carried over unchanged
// from the old version.
//
// Follow-up (same day): the artifact's "Start free" button turned out to
// open a real 4-step signup wizard (Account/Business/Plan/Payment), not a
// plain link — SIGNUP_ROUTE now points at the new /start route
// (SignupWizard.jsx) instead of the existing /signup/partner form. Nav
// and footer are shared with that wizard via HpcNav.jsx/HpcFooter.jsx so
// the two pages can't visually drift apart.

function CloudBackground() {
  return (
    <div className="hpc-hero-clouds" aria-hidden="true">
      <img src={Cloud1} style={{ width: "30%", top: 0, left: "10%" }} className="animate-cloud-circle" alt="" />
      <img src={Cloud1} style={{ width: "42%", top: "15%", left: "0%" }} className="animate-cloud-circle-reverse" alt="" />
      <img src={Cloud1} style={{ width: "36%", top: "0%", left: "28%" }} className="animate-cloud-circle-slow" alt="" />
      <img src={Cloud1} style={{ width: "40%", top: "5%", left: "62%" }} className="animate-cloud-circle-slow" alt="" />
      <img src={Cloud1} style={{ width: "34%", top: "20%", left: "70%" }} className="animate-cloud-circle-reverse" alt="" />
    </div>
  );
}

function IconCheck({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function IconClock({ size = 18 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9" />
      <polyline points="12 7 12 12 15.5 14" />
    </svg>
  );
}

function IconPhone({ size = 32 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  );
}

function HeroVisual() {
  // Confetti-wave figure in a soft navy card + two floating status
  // badges, standing in for the artifact's "fundability check done"
  // hero illustration.
  return (
    <div className="hpc-hero-card">
      <div className="hpc-badge-float hpc-badge-float-top">
        <span className="hpc-badge-icon hpc-badge-icon-check"><IconCheck size={15} /></span>
        <div>
          <div className="hpc-badge-title">Client approved</div>
          <div className="hpc-badge-sub">Business line of credit</div>
        </div>
      </div>
      <div className="hpc-hero-card-inner">
        <svg width="150" height="190" viewBox="0 0 150 190" fill="none">
          <circle cx="55" cy="55" r="34" fill="#2a3b73" opacity="0.8" />
          <circle cx="110" cy="40" r="22" fill="#2a3b73" opacity="0.6" />
          <circle cx="75" cy="40" r="16" fill="#f1c983" />
          <path d="M60 70 Q75 55 90 70 L92 150 Q75 162 58 150 Z" fill="#e8c468" />
          <path d="M60 78 L28 50" stroke="#f1c983" strokeWidth="8" strokeLinecap="round" />
          <path d="M90 78 L120 48" stroke="#f1c983" strokeWidth="8" strokeLinecap="round" />
          <path d="M58 150 L52 188 M92 150 L98 188" stroke="#1d2c5c" strokeWidth="9" strokeLinecap="round" />
          {["M20 30 l6 6", "M30 20 l0 8", "M124 70 l6 4", "M20 90 l6 2"].map((d, i) => (
            <path key={i} d={d} stroke="#e8c468" strokeWidth="3" strokeLinecap="round" />
          ))}
        </svg>
      </div>
      <div className="hpc-badge-float hpc-badge-float-bottom">
        <span className="hpc-badge-icon hpc-badge-icon-clock"><IconClock size={15} /></span>
        <div>
          <div className="hpc-badge-title">Fundability check done</div>
          <div className="hpc-badge-sub">48 seconds</div>
        </div>
      </div>
    </div>
  );
}

function RadialCountdown() {
  const ticks = Array.from({ length: 24 });
  return (
    <div className="hpc-radial">
      {ticks.map((_, i) => (
        <span key={i} className="hpc-radial-tick" style={{ transform: `rotate(${i * 15}deg)` }} />
      ))}
      <div className="hpc-radial-content">
        <div className="hpc-radial-number hpc-serif">48</div>
        <div className="hpc-radial-label">SECONDS</div>
        <div className="hpc-radial-sub">Fundability check complete</div>
      </div>
    </div>
  );
}

function BlueprintMock() {
  const bars = [40, 60, 48, 78, 100];
  return (
    <div className="hpc-blueprint">
      <div className="hpc-blueprint-grid">
        <svg viewBox="0 0 400 140" width="100%" height="120">
          {bars.map((h, i) => (
            <rect
              key={i}
              x={20 + i * 76}
              y={120 - h}
              width="40"
              height={h}
              rx="4"
              fill={i === bars.length - 1 ? "#e8c468" : "#3a4d8c"}
            />
          ))}
          <polyline
            points="40,70 116,55 192,65 268,25 344,10"
            fill="none"
            stroke="#e8c468"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      </div>
      <div className="hpc-blueprint-caption">BLUEPRINT · CLIENT 2041</div>
    </div>
  );
}

const CLIENT_STATUSES = [
  { name: "Marcus L.", initials: "ML", label: "Call scheduled", color: "#5eead4" },
  { name: "Brianna W.", initials: "BW", label: "Blueprint done", color: "#5eead4" },
  { name: "Chris P.", initials: "CP", label: "Docs due tomorrow", color: "#e8c468" },
  { name: "Nia H.", initials: "NH", label: "Ready to fund", color: "#e8c468" },
  { name: "Jordan R.", initials: "JR", label: "Documents in", color: "#5eead4" },
  { name: "Alicia M.", initials: "AM", label: "Plan sent", color: "#5eead4" },
  { name: "Devon K.", initials: "DK", label: "Follow-up today", color: "#e8c468" },
];

function ClientStatusList() {
  return (
    <div className="hpc-status-list">
      {CLIENT_STATUSES.map((c) => (
        <div className="hpc-status-row" key={c.name}>
          <div className="hpc-status-who">
            <span className="hpc-status-avatar">{c.initials}</span>
            <span className="hpc-status-name">{c.name}</span>
          </div>
          <span className="hpc-status-label">
            <span className="hpc-status-dot" style={{ background: c.color }} />
            {c.label}
          </span>
        </div>
      ))}
    </div>
  );
}

function CallCenterVisual() {
  const bars = [10, 22, 14, 30, 18, 26, 12, 24, 16, 30, 20, 14, 26, 18, 10, 28, 16, 22, 12, 24];
  return (
    <div className="hpc-call-visual">
      <div className="hpc-call-rings">
        <div className="hpc-call-phone"><IconPhone size={34} /></div>
      </div>
      <div className="hpc-waveform">
        {bars.map((h, i) => (
          <span key={i} style={{ height: `${h}px` }} />
        ))}
      </div>
      <div className="hpc-call-tags">
        <span>QUEUE</span>
        <span>SCRIPTS</span>
        <span>CALL LOG</span>
      </div>
    </div>
  );
}

function LetterStack() {
  return (
    <div className="hpc-letters">
      <div className="hpc-letter-sheet hpc-letter-sheet-1" />
      <div className="hpc-letter-sheet hpc-letter-sheet-2" />
      <div className="hpc-letter-sheet hpc-letter-sheet-3">
        <div className="hpc-letter-line hpc-letter-line-dark" />
        <div className="hpc-letter-line" style={{ width: "90%" }} />
        <div className="hpc-letter-line" style={{ width: "75%" }} />
        <div className="hpc-letter-line" style={{ width: "85%" }} />
        <div className="hpc-letter-line" style={{ width: "60%" }} />
        <span className="hpc-letter-check"><IconCheck size={20} /></span>
      </div>
    </div>
  );
}

const HOUSE_FEATURES = [
  { title: "Built-in CRM", copy: "Leads from your ads land in your portal, ready to work." },
  { title: "Report analysis", copy: "Separates every item that needs attention." },
  { title: "Document vault", copy: "Checks IDs and addresses on upload." },
  { title: "Agents and team roles", copy: "A dashboard for every seat." },
  { title: "White label", copy: "Your logo on the portal and the reports." },
  { title: "Ledger and dashboard", copy: "Revenue, active files, and pipeline at a glance." },
  { title: "Vetted network", copy: "Lenders and partners we actually use." },
  { title: "Client portal", copy: "Your clients check progress on their own, 24/7." },
];

function ResultsIllustration() {
  return (
    <div className="hpc-results-panel">
      <svg viewBox="0 0 520 300" width="100%" height="auto">
        <rect x="190" y="20" width="260" height="160" rx="14" fill="#1d2c5c" />
        <circle cx="300" cy="90" r="30" fill="#2a3b73" />
        <circle cx="400" cy="65" r="16" fill="#2a3b73" />
        <polyline points="230,160 260,140 290,150 320,110 350,95 380,75" fill="none" stroke="#e8c468" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="230" y="150" width="14" height="20" fill="#3a4d8c" />
        <rect x="260" y="130" width="14" height="40" fill="#3a4d8c" />
        <rect x="290" y="140" width="14" height="30" fill="#3a4d8c" />
        <rect x="320" y="100" width="14" height="70" fill="#3a4d8c" />
        <rect x="350" y="85" width="14" height="85" fill="#e8c468" />
        {/* presenter */}
        <path d="M110 300 L110 220 Q110 190 140 190 Q170 190 170 220 L170 300 Z" fill="#9b3b52" />
        <circle cx="140" cy="165" r="26" fill="#d9a06b" />
        <path d="M118 150 Q140 125 162 150 L162 158 Q140 140 118 158 Z" fill="#2a1f1a" />
        <path d="M170 215 L210 195" stroke="#d9a06b" strokeWidth="14" strokeLinecap="round" />
        <circle cx="212" cy="193" r="8" fill="#d9a06b" />
        {/* audience */}
        {[270, 330, 390].map((x, i) => (
          <g key={x}>
            <circle cx={x} cy="255" r="18" fill="#d9a06b" />
            <path d={`M${x - 26} 300 L${x - 26} 280 Q${x - 26} 262 ${x} 262 Q${x + 26} 262 ${x + 26} 280 L${x + 26} 300 Z`} fill={i % 2 === 0 ? "#3a4d8c" : "#2a3b73"} />
          </g>
        ))}
      </svg>
    </div>
  );
}

function PersonaIllustration({ variant }) {
  if (variant === "solo") {
    return (
      <div className="hpc-persona-card">
        <svg viewBox="0 0 320 220" width="100%" height="200">
          <circle cx="90" cy="60" r="26" fill="#3a4d8c" />
          <circle cx="230" cy="45" r="18" fill="#3a4d8c" opacity="0.8" />
          <path d="M70 90 Q90 70 110 90 L112 150 Q90 160 68 150 Z" fill="#e8c468" />
          <circle cx="90" cy="60" r="16" fill="#d9a06b" />
          <path d="M50 70 L30 40 M130 70 L150 40" stroke="#d9a06b" strokeWidth="8" strokeLinecap="round" />
          <circle cx="30" cy="38" r="6" fill="#d9a06b" />
          <circle cx="150" cy="38" r="6" fill="#d9a06b" />
          <path d="M80 148 L76 190 M100 148 L104 190" stroke="#1d2c5c" strokeWidth="8" strokeLinecap="round" />
        </svg>
        <div className="hpc-persona-bar" style={{ position: "absolute", bottom: 0, left: 0, right: 0 }} />
      </div>
    );
  }
  return (
    <div className="hpc-persona-card">
      <svg viewBox="0 0 320 220" width="100%" height="200">
        <circle cx="90" cy="55" r="20" fill="#3a4d8c" />
        <circle cx="230" cy="50" r="18" fill="#3a4d8c" opacity="0.8" />
        <path d="M75 85 Q100 70 120 90 L122 150 Q98 162 76 150 Z" fill="#1d2c5c" />
        <circle cx="95" cy="60" r="16" fill="#d9a06b" />
        <path d="M60 60 Q80 45 100 55" stroke="#2a1f1a" strokeWidth="6" fill="none" />
        <path d="M195 85 Q220 70 240 90 L238 150 Q214 162 192 150 Z" fill="#9b3b52" />
        <circle cx="215" cy="60" r="16" fill="#d9a06b" />
        <path d="M118 108 L196 108" stroke="#d9a06b" strokeWidth="9" strokeLinecap="round" />
        {["M150 95 l6 4", "M158 92 l0 6", "M150 104 l-4 4"].map((d, i) => (
          <path key={i} d={d} stroke="#e8c468" strokeWidth="3" strokeLinecap="round" />
        ))}
      </svg>
    </div>
  );
}

const WHY_SWITCH = [
  { title: "Built by operators", copy: "Our own team runs files on this software every day. Every feature exists because we needed it." },
  { title: "Readiness, not guesswork", copy: "You see what it takes to get each client funded, before anyone applies." },
  { title: "Nothing slips", copy: "Every file has an owner, a status, and an alert. You'll never find out about a problem too late." },
  { title: "Help when you want it", copy: "Run everything yourself, or add our team to handle files for you, right from your portal." },
];

// Feeds the scrolling .hpc-tour-track marquee below the hero.
const TOUR_ITEMS = ["Team roles", "White label", "Client portal", "Funding Blueprint"];

const STEPS = [
  { label: "Step 1", title: "Create your account", copy: "Pick your workspace and start with 2 free reports." },
  { label: "Step 2", title: "Add a client", copy: "Upload their documents. The portal organizes and checks everything." },
  { label: "Step 3", title: "Run the report", copy: "See the score and the plan, then work the file or hand it to our team." },
];

export default function LandingPage() {
  return (
    <div className="hpc-page">
      <HpcNav />

      {/* HERO */}
      <section className="hpc-hero">
        <CloudBackground />
        <div className="hpc-hero-inner">
          <div>
            <div className="hpc-eyebrow">For brokers done doing it the hard way</div>
            <h1 className="hpc-hero-headline hpc-serif">
              Happy brokers <em>close more.</em>
            </h1>
            <p className="hpc-hero-sub">
              Fundability in 60 seconds. Follow-ups that send themselves. A portal your clients brag about. Everything behind the deal, finally in one place.
            </p>
            <div className="hpc-hero-ctas">
              <Link to={SIGNUP_ROUTE} className="hpc-btn hpc-btn-gold">Start free &rarr;</Link>
              <a href={PRICING_URL} target="_blank" rel="noreferrer" className="hpc-btn hpc-btn-outline">See pricing</a>
            </div>
            <div className="hpc-hero-fine">2 free reports. $0 today. Cancel anytime.</div>
            <div className="hpc-hero-member">
              Already a member? <Link to="/login">Log in to your portal &rarr;</Link>
            </div>
          </div>
          <div className="hpc-hero-visual">
            <HeroVisual />
          </div>
        </div>
      </section>

      {/* TOUR STRIP — continuously scrolling marquee (see
          .hpc-tour-track in LandingPage.css). TOUR_ITEMS is rendered
          twice back-to-back so the loop has no visible seam. */}
      <div className="hpc-tour-strip" id="tour">
        <div className="hpc-tour-track" aria-hidden="false">
          {[0, 1].map((copy) => (
            <div className="hpc-tour-strip-group" key={copy} aria-hidden={copy === 1}>
              {TOUR_ITEMS.map((item, i) => (
                <React.Fragment key={item}>
                  {i > 0 && <span className="hpc-tour-dot">&bull;</span>}
                  <span>{item}</span>
                </React.Fragment>
              ))}
            </div>
          ))}
        </div>
      </div>

      {/* COME ON IN */}
      <section className="hpc-section hpc-section-center">
        <div className="hpc-section-inner">
          <div className="hpc-eyebrow">Come on in</div>
          <h2 className="hpc-section-heading hpc-serif">
            Take the tour. <em>Every room earns its keep.</em>
          </h2>
        </div>
      </section>

      {/* SPEED */}
      <section className="hpc-section">
        <div className="hpc-section-inner hpc-showcase">
          <div>
            <div className="hpc-eyebrow">Speed</div>
            <h2 className="hpc-section-heading hpc-serif">
              Know in under <em>60 seconds.</em>
            </h2>
            <p className="hpc-section-copy">
              A lead calls. Before you hang up, you know if they're ready, what's in the way, and exactly what it'll take. No more hour-long guesswork.
            </p>
          </div>
          <div className="hpc-showcase-visual">
            <RadialCountdown />
          </div>
        </div>
      </section>

      {/* FUNDING BLUEPRINT */}
      <section className="hpc-section">
        <div className="hpc-section-inner hpc-showcase hpc-showcase-reverse">
          <div>
            <div className="hpc-eyebrow">The funding blueprint</div>
            <h2 className="hpc-section-heading hpc-serif">
              A plan they can <em>build on.</em>
            </h2>
            <p className="hpc-section-copy">
              Every client walks away with a score and a step-by-step plan in plain English. Your clients get it. Underwriters respect it. You look like the expert you are.
            </p>
          </div>
          <div className="hpc-showcase-visual">
            <BlueprintMock />
          </div>
        </div>
      </section>

      {/* CASE TRACKING */}
      <section className="hpc-section">
        <div className="hpc-section-inner hpc-showcase">
          <div>
            <div className="hpc-eyebrow">Case tracking and automations</div>
            <h2 className="hpc-section-heading hpc-serif">
              No client falls <em>through the cracks.</em>
            </h2>
            <p className="hpc-section-copy">
              Every file has an owner, a status, and a clock. Reminders and follow-ups go out on their own, and you hear about a problem days before it becomes one.
            </p>
          </div>
          <div className="hpc-showcase-visual">
            <ClientStatusList />
          </div>
        </div>
      </section>

      {/* CALL CENTER */}
      <section className="hpc-section">
        <div className="hpc-section-inner hpc-showcase hpc-showcase-reverse">
          <div>
            <div className="hpc-eyebrow">Call center</div>
            <h2 className="hpc-section-heading hpc-serif">
              Your call center, <em>built in.</em>
            </h2>
            <p className="hpc-section-copy">
              Your callers get their own queue, scripts, and call logs. Every call lands on the client's file, so whoever picks up next already knows the whole story.
            </p>
          </div>
          <div className="hpc-showcase-visual">
            <CallCenterVisual />
          </div>
        </div>
      </section>

      {/* LETTER BUILDER */}
      <section className="hpc-section">
        <div className="hpc-section-inner hpc-showcase">
          <div>
            <div className="hpc-eyebrow">Letter builder</div>
            <h2 className="hpc-section-heading hpc-serif">
              Letters in <em>one click.</em>
            </h2>
            <p className="hpc-section-copy">
              Pick the letter. Pick the client. Done. Names, addresses, and documents fill themselves in, so your team stops copying and pasting for good.
            </p>
          </div>
          <div className="hpc-showcase-visual">
            <LetterStack />
          </div>
        </div>
      </section>

      {/* REST OF THE HOUSE */}
      <section className="hpc-section hpc-section-center">
        <div className="hpc-section-inner">
          <div className="hpc-eyebrow">The rest of the house</div>
          <h2 className="hpc-section-heading hpc-serif">
            And that's just the main floor. <em>Keep going.</em>
          </h2>
          <div className="hpc-feature-grid" style={{ textAlign: "left" }}>
            {HOUSE_FEATURES.map((f) => (
              <div className="hpc-feature-item" key={f.title}>
                <div className="hpc-feature-item-title">
                  <span className="hpc-feature-diamond">&#9670;</span> {f.title}
                </div>
                <p className="hpc-feature-item-copy">{f.copy}</p>
              </div>
            ))}
          </div>
          <ResultsIllustration />
        </div>
      </section>

      {/* WHO IT'S FOR */}
      <section className="hpc-section">
        <div className="hpc-section-inner">
          <div className="hpc-persona-grid">
            <div>
              <PersonaIllustration variant="solo" />
              <h3 className="hpc-persona-title hpc-serif">The solo broker</h3>
              <p className="hpc-persona-copy">Look like a full operation from day one, without hiring one.</p>
            </div>
            <div>
              <PersonaIllustration variant="team" />
              <h3 className="hpc-persona-title hpc-serif">The growing team</h3>
              <p className="hpc-persona-copy">Hand off files without losing a single detail or a single client.</p>
            </div>
          </div>
        </div>
      </section>

      {/* WHY BROKERS SWITCH */}
      <section className="hpc-section">
        <div className="hpc-section-inner">
          <div className="hpc-eyebrow">Why brokers switch</div>
          <h2 className="hpc-section-heading hpc-serif">Happy brokers, happy business.</h2>
          <p className="hpc-section-copy">
            Other tools give you a place to store files. This one helps you close them, and helps you enjoy the work again.
          </p>
          <div className="hpc-switch-grid">
            {WHY_SWITCH.map((item) => (
              <div className="hpc-switch-item" key={item.title}>
                <h3 className="hpc-switch-item-title hpc-serif">{item.title}</h3>
                <p className="hpc-switch-item-copy">{item.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* STEPS */}
      <section className="hpc-section">
        <div className="hpc-section-inner">
          <div className="hpc-steps">
            {STEPS.map((s) => (
              <div className="hpc-step" key={s.label}>
                <div className="hpc-step-label">{s.label}</div>
                <h3 className="hpc-step-title hpc-serif">{s.title}</h3>
                <p className="hpc-step-copy">{s.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="hpc-section hpc-section-center hpc-final-cta">
        <div className="hpc-section-inner">
          <div className="hpc-eyebrow">Try it on real files</div>
          <h2 className="hpc-section-heading hpc-serif">
            Your next happy client is <em>two clicks away.</em>
          </h2>
          <p className="hpc-section-copy">
            Start with 2 free reports on your real clients. $0 today, no calls, cancel anytime.
          </p>
          <div className="hpc-final-ctas">
            <Link to={SIGNUP_ROUTE} className="hpc-btn hpc-btn-gold">Start free</Link>
            <a href={PRICING_URL} target="_blank" rel="noreferrer" className="hpc-btn hpc-btn-outline">See pricing</a>
          </div>
        </div>
      </section>

      <HpcFooter />
    </div>
  );
}
