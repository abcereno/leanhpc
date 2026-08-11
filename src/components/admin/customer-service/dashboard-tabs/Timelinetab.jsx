import React, { useState, useEffect } from 'react';
import { Spinner } from 'react-bootstrap';
import { supabase } from '../../../../supabaseClient';

export default function TimelineTab({ client }) {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchTimeline = async () => {
      if (!client?.id) return;
      setLoading(true);

      try {
        // 1. Fetch Call Logs
        const { data: calls, error: callErr } = await supabase
          .from('call_logs')
          .select(`
            id, 
            call_date, 
            reason, 
            exp_result, 
            tu_result, 
            eq_result, 
            profiles(full_name)
          `)
          .eq('client_id', client.id)
          .order('call_date', { ascending: false });

        if (callErr) throw callErr;

        // 2. Fetch Document Logs
        const { data: docs, error: docErr } = await supabase
          .from('document_logs')
          .select(`
            id, 
            submitted_at, 
            note, 
            profiles(full_name)
          `)
          .eq('client_id', client.id)
          .order('submitted_at', { ascending: false });

        if (docErr) throw docErr;

        // 3. Normalize & Merge
        const formattedCalls = (calls || []).map(c => ({
          id: `call-${c.id}`,
          type: 'call',
          date: new Date(c.call_date),
          title: 'Call Logged',
          // Build a quick summary string of results
          description: [
            c.reason,
            c.exp_result ? `EXP: ${c.exp_result}` : null,
            c.tu_result ? `TU: ${c.tu_result}` : null,
            c.eq_result ? `EQ: ${c.eq_result}` : null
          ].filter(Boolean).join(' • ') || 'No details provided',
          user: c.profiles?.full_name || 'System'
        }));

        const formattedDocs = (docs || []).map(d => ({
          id: `doc-${d.id}`,
          type: 'doc',
          date: new Date(d.submitted_at),
          title: 'Document Submitted',
          description: d.note || 'No notes provided',
          user: d.profiles?.full_name || 'System'
        }));

        // Combine and Sort by Date Descending
        const merged = [...formattedCalls, ...formattedDocs].sort((a, b) => b.date - a.date);
        
        setActivities(merged);

      } catch (err) {
        console.error("Error fetching timeline:", err);
      } finally {
        setLoading(false);
      }
    };

    fetchTimeline();
  }, [client]);

  // --- RENDER HELPERS ---
  const formatTime = (dateObj) => {
    return dateObj.toLocaleDateString("en-US", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit"
    });
  };

  if (loading) return <div className="text-center p-5"><Spinner size="sm" animation="border" /></div>;

  return (
    <div className="p-4">
      <h5 className="fw-bold mb-4 ps-1 text-dark">Activity Log</h5>
      
      {activities.length === 0 ? (
        <div className="text-muted small fst-italic ms-3 p-4 bg-light rounded text-center border border-dashed">
            No activity recorded yet.
        </div>
      ) : (
        <div className="border-start border-2 ps-4 ms-2" style={{ borderColor: '#dee2e6' }}>
          {activities.map((item) => (
            <div key={item.id} className="mb-5 position-relative">
              
              {/* Timeline Icon */}
              <div 
                className="position-absolute start-0 translate-middle-x bg-white d-flex align-items-center justify-content-center shadow-sm" 
                style={{
                    left: '-17px', 
                    top: '0', 
                    width: '32px', 
                    height: '32px',
                    borderRadius: '50%',
                    border: '1px solid #e9ecef',
                    zIndex: 1
                }}
              >
                  {item.type === 'call' ? (
                      <i className="bi bi-telephone-fill text-primary" style={{ fontSize: '0.9rem' }}></i>
                  ) : (
                      <i className="bi bi-file-earmark-text-fill text-success" style={{ fontSize: '0.9rem' }}></i>
                  )}
              </div>

              {/* Content Block */}
              <div className="ps-4">
                <div className="d-flex align-items-center mb-2 text-muted small text-uppercase fw-bold" style={{ letterSpacing: '0.5px', fontSize: '0.75rem' }}>
                    {formatTime(item.date)}
                    <span className="mx-2 text-secondary opacity-25">|</span> 
                    <span className="text-primary">{item.user}</span>
                </div>
                
                <div className="card shadow-sm border-0 bg-light">
                    <div className="card-body py-3 px-4">
                        <h6 className="fw-bold text-dark mb-2">{item.title}</h6>
                        <div className="text-secondary" style={{ fontSize: '0.9rem', lineHeight: '1.6', wordBreak: 'break-word' }}>
                            {item.description}
                        </div>
                    </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}