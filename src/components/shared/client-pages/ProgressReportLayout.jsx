import React from "react";
import { Row, Col, Badge } from "react-bootstrap";
import { Line, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, Filler
} from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement, Filler);

export default function ProgressReportLayout({ data }) {
  if (!data) return null;

  const { clientName, startDate, currentDate, scores, results } = data;
  
  const companyInfo = {
      name: "Hidden Partner Cloud",
      phone: "(919) 300-5202",
      web: "www.hiddenpartnercloud.com",
      email: "support@hiddenpartnercloud.com"
  };

  // 👇 HIGH CONTRAST COLOR PALETTE 👇
  const colors = {
      EX: { primary: '#2563eb', textDark: '#1e40af', bg: '#eff6ff', border: '#bfdbfe' }, // textDark: Blue-800
      TU: { primary: '#0d9488', textDark: '#115e59', bg: '#f0fdfa', border: '#99f6e4' }, // textDark: Teal-800
      EQ: { primary: '#d97706', textDark: '#92400e', bg: '#fffbeb', border: '#fde68a' }, // textDark: Amber-800
      textMain: '#0f172a',    // Near Black (Slate 900)
      textMuted: '#334155',   // Dark Gray (Slate 700)
      success: '#16a34a',     // Chart Green
      textSuccess: '#15803d', // Dark Green Text
      danger: '#dc2626',      // Chart Red
      textDanger: '#b91c1c',  // Dark Red Text
      warning: '#eab308'      // Chart Yellow/Amber
  };

  const getLineData = (bureauCode) => ({
    labels: scores.history.map(h => h.date),
    datasets: [{
      label: 'Score',
      data: scores.history.map(h => h[bureauCode]),
      borderColor: colors[bureauCode].primary,
      backgroundColor: colors[bureauCode].primary + '1A', 
      fill: true, 
      borderWidth: 2,
      tension: 0.4, 
      pointRadius: 3,
      pointBackgroundColor: '#fff',
      pointBorderColor: colors[bureauCode].primary,
      pointBorderWidth: 2,
    }]
  });

  const getDoughnutData = (bureauCode) => {
      const res = results[bureauCode];
      return {
          labels: ['Deleted', 'Remaining', 'Added'],
          datasets: [{
              data: [res.deleted, res.remaining, res.added],
              backgroundColor: [colors.success, colors.warning, colors.danger], 
              borderWidth: 2,
              borderColor: '#ffffff'
          }]
      };
  };

  const bureauFull = { EX: "Experian", TU: "TransUnion", EQ: "Equifax" };

  return (
    <div style={{ minHeight: '100%', boxSizing: 'border-box', display: 'flex', flexDirection: 'column', fontFamily: '"Inter", "Helvetica Neue", Arial, sans-serif' }}>
        
        {/* --- PREMIUM LETTERHEAD HEADER --- */}
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-end mb-4" style={{ borderBottom: `3px solid ${colors.EX.primary}`, paddingBottom: '20px' }}>
            <div className="mb-3 mb-md-0">
                <h1 style={{ fontWeight: '900', color: colors.textMain, margin: 0, letterSpacing: '-0.5px', fontSize: '28px' }}>
                    CREDIT AUDIT <span style={{ color: colors.EX.textDark }}>PROGRESS</span>
                </h1>
                <div style={{ color: colors.textMuted, fontSize: '13px', marginTop: '4px' }}>
                    Prepared by <strong style={{color: colors.textMain}}>{companyInfo.name}</strong>
                </div>
            </div>
            <div className="text-md-end">
                <h4 style={{ fontWeight: '700', color: colors.textMain, margin: 0, fontSize: '18px' }}>{clientName}</h4>
                <div style={{ color: colors.textMain, fontSize: '12px', marginTop: '2px', backgroundColor: '#e2e8f0', padding: '4px 8px', borderRadius: '4px', display: 'inline-block' }}>
                    <strong>Period:</strong> {startDate} — {currentDate}
                </div>
            </div>
        </div>

        {/* --- EXECUTIVE SCORE SUMMARY --- */}
        <Row className="g-3 mb-4">
            {['EX', 'TU', 'EQ'].map(b => {
                const currentScore = scores.current[b] || 0;
                const startScore = scores.start[b] || 0;
                const diff = currentScore - startScore;

                return (
                    <Col xs={12} md={4} key={b}>
                        <div style={{ backgroundColor: colors[b].bg, border: `1px solid ${colors[b].border}`, borderRadius: '10px', padding: '16px', textAlign: 'center', height: '100%' }}>
                            <div style={{ color: colors[b].textDark, fontSize: '12px', fontWeight: '800', letterSpacing: '1.5px', textTransform: 'uppercase', marginBottom: '6px' }}>
                                {bureauFull[b]}
                            </div>
                            <div style={{ fontSize: '32px', fontWeight: '900', color: colors.textMain, lineHeight: '1', marginBottom: '8px' }}>
                                {currentScore}
                            </div>
                            <div style={{ 
                                display: 'inline-block',
                                padding: '4px 12px', 
                                borderRadius: '20px',
                                backgroundColor: diff > 0 ? '#d1fae5' : (diff < 0 ? '#fee2e2' : '#e2e8f0'),
                                fontSize: '11px', 
                                fontWeight: '800', 
                                color: diff > 0 ? colors.textSuccess : (diff < 0 ? colors.textDanger : colors.textMuted) 
                            }}>
                                 {diff > 0 ? `▲ +${diff} PTS` : diff === 0 ? 'NO CHANGE' : `▼ ${diff} PTS`}
                            </div>
                        </div>
                    </Col>
                );
            })}
        </Row>

        {/* --- DETAILED BUREAU BREAKDOWN --- */}
        <div style={{ flex: 1 }}>
            <h5 style={{ color: colors.textMain, fontWeight: '800', borderBottom: '2px solid #cbd5e1', paddingBottom: '8px', marginBottom: '20px', fontSize: '15px', textTransform: 'uppercase', letterSpacing: '1px' }}>
                Historical Performance
            </h5>

            {['EX', 'TU', 'EQ'].map(b => (
                <div key={b} className="d-flex flex-column flex-md-row mb-4" style={{ 
                    backgroundColor: '#ffffff', 
                    border: '1px solid #cbd5e1', 
                    borderRadius: '12px', 
                    overflow: 'hidden' 
                }}>
                    
                    {/* LEFT COLUMN: Line Graph */}
                    <div style={{ flex: 1, padding: '20px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px' }}>
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                                <div style={{ width: '14px', height: '14px', borderRadius: '4px', backgroundColor: colors[b].primary, marginRight: '10px' }}></div>
                                <h6 style={{ fontWeight: '800', margin: 0, color: colors.textMain, fontSize: '15px', letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                                    {bureauFull[b]}
                                </h6>
                            </div>
                            <div style={{ backgroundColor: colors[b].bg, border: `1px solid ${colors[b].border}`, color: colors[b].textDark, padding: '4px 10px', borderRadius: '6px', fontWeight: '800', fontSize: '12px' }}>
                                SCORE: {scores.current[b]}
                            </div>
                        </div>

                        <div style={{ height: '110px', width: '100%' }}>
                            <Line 
                                data={getLineData(b)} 
                                options={{
                                    responsive: true, maintainAspectRatio: false, animation: false,
                                    plugins: { legend: { display: false } },
                                    layout: { padding: { bottom: 5 } },
                                    scales: { 
                                      y: { min: 300, max: 850, ticks: { color: colors.textMuted, font: { size: 10, weight: '600' }, maxTicksLimit: 5 }, grid: { color: '#f1f5f9' }, border: { display: false } },
                                      x: { ticks: { color: colors.textMuted, font: { size: 9, weight: '600' } }, grid: { display: false }, border: { display: false } }
                                    }
                                }} 
                            />
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Stats Donut & Vertical Legend */}
                    <div className="border-md-start border-top border-md-top-0" style={{ 
                        minWidth: '240px', 
                        backgroundColor: '#f8fafc', 
                        padding: '15px 20px', 
                        display: 'flex', 
                        flexDirection: 'column', 
                        justifyContent: 'center',
                        borderColor: '#cbd5e1'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
                            
                            {/* Donut Chart */}
                            <div className="position-relative" style={{ height: '80px', width: '80px', flexShrink: 0 }}>
                                <Doughnut 
                                    data={getDoughnutData(b)} 
                                    options={{
                                        responsive: true, maintainAspectRatio: false, animation: false,
                                        plugins: { legend: { display: false }, tooltip: { enabled: false } }, cutout: '75%'
                                    }} 
                                />
                                <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', pointerEvents: 'none' }}>
                                    <div style={{ fontSize: '20px', fontWeight: '900', lineHeight: '1', color: colors.textMain }}>
                                        {results[b].deleted}
                                    </div>
                                </div>
                            </div>

                            {/* Vertical Legend */}
                            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', fontWeight: '700' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: colors.success }}></div>
                                        <span style={{ color: colors.textMain, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Deleted</span>
                                    </div>
                                    <span style={{ color: colors.textMain, fontSize: '12px' }}>{results[b].deleted}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', fontWeight: '700' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: colors.warning }}></div>
                                        <span style={{ color: colors.textMain, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Remaining</span>
                                    </div>
                                    <span style={{ color: colors.textMain, fontSize: '12px' }}>{results[b].remaining}</span>
                                </div>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '10px', fontWeight: '700' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                        <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: colors.danger }}></div>
                                        <span style={{ color: colors.textMain, textTransform: 'uppercase', letterSpacing: '0.5px' }}>New</span>
                                    </div>
                                    <span style={{ color: colors.textMain, fontSize: '12px' }}>{results[b].added}</span>
                                </div>
                            </div>

                        </div>
                    </div>
                    
                </div>
            ))}
        </div>

        {/* --- PREMIUM FOOTER --- */}
        <div className="d-flex flex-column flex-md-row justify-content-between align-items-md-center mt-auto pt-3 border-top" style={{ color: colors.textMuted, borderColor: '#cbd5e1', fontSize: '11px' }}>
            <div className="mb-2 mb-md-0 text-center text-md-start">
                <strong style={{ color: colors.textMain }}>{companyInfo.name}</strong><br/>
                {companyInfo.web}
            </div>
            <div className="text-center text-md-end">
                {companyInfo.phone}<br/>
                {companyInfo.email}
            </div>
        </div>
    </div>
  );
}