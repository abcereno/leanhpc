import React, { useEffect, useState } from "react";
import { Container, Spinner, Alert, Button } from "react-bootstrap";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import ClientCreditReportDisplay from "../shared/client-pages/ClientCreditReportDisplay";

export default function IndividualCreditFileLoader() {
  const [myClientId, setMyClientId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchMyProfile = async () => {
      try {
        setLoading(true);

        // 1. Get the currently logged-in user
        const { data: { user } } = await supabase.auth.getUser();

        if (!user) {
            navigate('/login');
            return;
        }

        // 2. Find the client row linked to this Auth ID
        const { data, error } = await supabase
          .from("clients")
          .select("id")
          .eq("auth_user_id", user.id) // <--- This is the key fix
          .maybeSingle();

        if (error) throw error;

        if (!data) {
            throw new Error("No client profile found for your account.");
        }

        setMyClientId(data.id);
        
      } catch (err) {
        console.error("Error finding individual profile:", err);
        setError(err.message || "Could not locate your credit file.");
      } finally {
        setLoading(false);
      }
    };

    fetchMyProfile();
  }, [navigate]);

  if (loading) {
    return (
      <Container className="d-flex justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
        <Spinner animation="border" variant="primary" />
        <p className="ms-3 mb-0 text-muted">Loading your credit file...</p>
      </Container>
    );
  }

  if (error || !myClientId) {
      return (
          <Container className="mt-5">
              <Alert variant="warning">
                  <Alert.Heading>Profile Not Found</Alert.Heading>
                  <p>{error}</p>
                  <Button variant="outline-dark" onClick={() => navigate('/my-dashboard')}>Return to Dashboard</Button>
              </Alert>
          </Container>
      );
  }

  return (
    <Container fluid="xl" className="my-4">
        <div className="mb-3">
            <Button variant="outline-secondary" size="sm" onClick={() => navigate('/my-dashboard')}>
                <i className="bi bi-arrow-left me-2"></i> Back to Dashboard
            </Button>
        </div>
        {/* Pass the correct Database ID to the display component */}
        <ClientCreditReportDisplay clientId={myClientId} />
    </Container>
  );
}