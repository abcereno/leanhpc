import React, { useEffect, useState } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { Card, Spinner } from 'react-bootstrap';
import { supabase } from '../../supabaseClient';
import { useCompanyAuth } from '../../context/CompanyAuthContext';

ChartJS.register(ArcElement, Tooltip, Legend);

export default function ClientStageChart({ refreshKey }) {
  // [CHANGE] Destructure isAgent and user
  const { companyId, isAgent, user } = useCompanyAuth();
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState(null);

  useEffect(() => {
    if (!companyId) return;

    const fetchData = async () => {
      try {
        setLoading(true);
        
        let query = supabase
          .from('clients')
          .select('status_stage, agent_id') // Fetch agent_id to be safe, though filter happens on DB
          .eq('company_id', companyId);

        // [RESTRICTION] Agents only see their own clients' stages
        if (isAgent && user?.id) {
            query = query.eq('agent_id', user.id);
        }

        const { data, error } = await query;

        if (error) throw error;

        // Aggregate counts by stage
        const counts = {};
        data.forEach(c => {
          // Default to 'New' if status_stage is null/empty
          const stage = c.status_stage || 'New';
          counts[stage] = (counts[stage] || 0) + 1;
        });

        const labels = Object.keys(counts);
        const values = Object.values(counts);

        setChartData({
          labels,
          datasets: [
            {
              data: values,
              backgroundColor: [
                '#0d6efd', // Primary Blue
                '#198754', // Success Green
                '#ffc107', // Warning Yellow
                '#0dcaf0', // Info Cyan
                '#6c757d', // Gray
                '#6610f2', // Purple
                '#dc3545', // Danger Red
              ],
              borderWidth: 1,
              hoverOffset: 4,
            },
          ],
        });
      } catch (err) {
        console.error('Error loading chart:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [companyId, refreshKey, isAgent, user?.id]);

  if (loading) {
    return (
      <Card className="shadow-sm border-0 h-100">
        <Card.Body className="d-flex align-items-center justify-content-center" style={{ minHeight: '300px' }}>
           <Spinner animation="border" size="sm" variant="primary" />
        </Card.Body>
      </Card>
    );
  }

  if (!chartData || chartData.labels.length === 0) {
     return (
      <Card className="shadow-sm border-0 h-100">
        <Card.Body className="d-flex flex-column align-items-center justify-content-center text-muted py-5">
           <i className="bi bi-pie-chart fs-1 mb-2 opacity-25"></i>
           <p className="mb-0 small">No client data to display</p>
        </Card.Body>
      </Card>
     );
  }

  return (
    <Card className="shadow-sm border-0 h-100">
      <Card.Header className="bg-white border-bottom-0 pt-3">
        <h6 className="fw-bold mb-0 text-dark">
            <i className="bi bi-pie-chart-fill me-2 text-primary"></i>
            Client Stages
        </h6>
      </Card.Header>
      <Card.Body className="d-flex align-items-center justify-content-center" style={{ minHeight: '300px' }}>
        <div style={{ width: '100%', maxWidth: '260px' }}>
          <Doughnut 
            data={chartData} 
            options={{
              responsive: true,
              maintainAspectRatio: true,
              plugins: {
                legend: { 
                    position: 'bottom', 
                    labels: { 
                        boxWidth: 12, 
                        padding: 15,
                        font: { size: 11, family: 'inherit' } 
                    } 
                }
              },
              cutout: '65%', 
            }} 
          />
        </div>
      </Card.Body>
    </Card>
  );
}