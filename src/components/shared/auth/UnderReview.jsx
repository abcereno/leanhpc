import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../../supabaseClient";
import { Container, Card, Spinner, Button, Ratio } from "react-bootstrap";
import welcome from "../../../assets/videos/review.mp4"

export default function UnderReview() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);

  // The core verification function
  const verifyStatus = async () => {
    setChecking(true);
    console.log("=====================================");
    console.log("🚀 STARTING ACCOUNT STATUS CHECK...");
    
    try {
      // 1. Get the current logged-in user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      
      if (authError || !user) {
        console.warn("⚠️ No user found, redirecting to login.");
        navigate("/login"); // Redirect to login if unauthenticated
        setLoading(false);
        return;
      }

      const userId = user.id;
      console.log(`👤 Logged in Auth ID: ${userId}`);

      // 2. Check Partners (Companies)
      const { data: company } = await supabase
        .from("companies")
        .select("id, status")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (company && company.status === "active") {
        navigate(`/company-portal/${company.id}/dashboard`, { replace: true });
        return;
      }

      // 3. Check Affiliates
      const { data: affiliate } = await supabase
        .from("affiliates")
        .select("id, status")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (affiliate && affiliate.status === "active") {
        navigate(`/affiliate-portal/${affiliate.id}/dashboard`, { replace: true });
        return;
      }

      // 4. Check Clients (Individuals)
      const { data: client } = await supabase
        .from("clients")
        .select("id, status")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (client && client.status === "active") {
        navigate("/my-dashboard", { replace: true });
        return;
      }

      // If we reach here, they are truly still pending or invisible.
      setLoading(false);
    } catch (err) {
      console.error("❌ Catch Block Error verifying account status:", err);
      setLoading(false);
    } finally {
      setChecking(false);
      console.log("=====================================");
    }
  };

  // Run the check automatically when the component mounts
  useEffect(() => {
    verifyStatus();
  }, [navigate]);

// 👇 UPDATED: Real Supabase Sign Out + Storage Wipe 👇
  const handleLogout = async () => {
    try {
      console.log("Signing out...");
      
      // 1. Terminate the Supabase session (This handles the Supabase tokens)
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      
      // 2. Nuke all custom app data from the browser
      localStorage.clear();
      sessionStorage.clear();
      
      // 3. Redirect back to the login page or home page
      navigate("/"); 
    } catch (err) {
      console.error("Error signing out:", err.message);
      
      // FAILSAFE: Even if the network drops, wipe the local data and kick them to home
      localStorage.clear();
      sessionStorage.clear();
      navigate("/"); 
    }
  };

  // Show a full-screen spinner while the initial check runs
  if (loading) {
    return (
      <Container className="vh-100 d-flex justify-content-center align-items-center bg-light" fluid>
        <div className="text-center">
          <Spinner animation="border" variant="primary" style={{ width: '3rem', height: '3rem' }} />
          <h5 className="mt-3 text-muted">Checking account status...</h5>
        </div>
      </Container>
    );
  }

  return (
    <Container className="vh-100 d-flex justify-content-center align-items-center bg-light fade-in-element" fluid>
      <Card className="shadow-lg border-0" style={{ maxWidth: "600px", width: "100%", borderRadius: "1rem" }}>
        <Card.Body className="p-4 p-md-5 text-center">
          
          <div className="mb-3">
            <i className="bi bi-hourglass-split text-warning" style={{ fontSize: "3rem" }}></i>
          </div>
          
          <h2 className="fw-bold mb-4">Account Under Review</h2>
          
          {/* THE VIDEO EMBED */}
          <div className="mb-4 rounded overflow-hidden shadow-sm" style={{ border: "1px solid #e2e8f0" }}>
            <Ratio aspectRatio="16x9">
              {/* Note: If 'welcome' is a local mp4 file, you should use the <video> tag instead of an iframe for better local file support */}
              <video 
                src={welcome} 
                controls 
                autoPlay 
                muted 
                controlsList="nodownload"
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              >
                Your browser does not support the video tag.
              </video>
            </Ratio>
          </div>
          
          <p className="text-muted mb-4" style={{ fontSize: "1.05rem" }}>
            Your application has been received and is currently being reviewed by our administration team. 
            Please watch the short video above while you wait. We will notify you via email as soon as your account is approved.
          </p>

          <div className="d-grid gap-3">
            <Button 
              variant="primary" 
              size="lg" 
              className="fw-bold py-3 shadow-sm"
              onClick={verifyStatus}
              disabled={checking}
            >
              {checking ? (
                <><Spinner as="span" animation="border" size="sm" className="me-2" /> Checking...</>
              ) : (
                <><i className="bi bi-arrow-clockwise me-2"></i> Check Status Again</>
              )}
            </Button>
            
            <Button 
              variant="outline-secondary" 
              onClick={handleLogout}
              className="fw-medium"
            >
              Sign Out
            </Button>
          </div>

        </Card.Body>
      </Card>
    </Container>
  );
}