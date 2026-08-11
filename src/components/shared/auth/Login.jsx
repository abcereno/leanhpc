import { useState, useEffect } from "react";
import { useNavigate, Link, useLocation } from "react-router-dom";
import { supabase } from "../../../supabaseClient";
import {
  Spinner,
  Form,
  Button,
  Alert,
  Row,
  Col,
  Container,
  Nav,
} from "react-bootstrap";
import InquiryLoader from "../ui/InquiryLoader";
import LoginBG from "../../../assets/login-bg-video.mp4";
import "./Login.css";

export default function Login({
  initialMode = "login",
  initialType = "individual",
}) {
  const navigate = useNavigate();
  const location = useLocation();

  const startMode = location.state?.mode || initialMode;
  const startType = location.state?.type || initialType;

  const [mode, setMode] = useState(startMode);
  const [signupType, setSignupType] = useState(startType);

  const [step, setStep] = useState(1);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [fullName, setFullName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");

  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [roleChecking, setRoleChecking] = useState(false);

  useEffect(() => {
    // --- 🔐 PASSWORD RESET INTERCEPT ---
    // If the URL contains the recovery type, send them to update password page
    if (window.location.hash.includes("type=recovery")) {
      navigate("/update-password", { replace: true });
      return;
    }

    const checkSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session) {
        handleRoleRouting(session.user);
      }
    };
    checkSession();
  }, [navigate]);

  useEffect(() => {
    setMode(startMode);
    setSignupType(startType);
  }, [startMode, startType]);

  // --- 🚀 ROUTING LOGIC ---
  const handleRoleRouting = async (user) => {
    setRoleChecking(true);
    const minLoadTime = new Promise((resolve) => setTimeout(resolve, 2000));
    const userId = user.id;

    try {
      // 1. CHECK PROFILES TABLE (Admins, Owners, Developers)
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      if (profile) {
        const role = profile.role;
        if (role === "developer") {
          await minLoadTime;
          navigate(`/admin/${userId}`, { replace: true });
          return;
        }
        if (role === "customer_service") {
          await minLoadTime;
          navigate("/cs-dashboard", { replace: true });
          return;
        }
        if (["admin", "owner", "subadmin", "callers", "counters"].includes(role)) {
          await minLoadTime;
          navigate("/admin-dashboard", { replace: true });
          return;
        }
      }

      // 2. CHECK PARTNERS (Companies)
      const { data: company } = await supabase
        .from("companies")
        .select("id, status")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (company) {
        await minLoadTime;
        // 🛑 Under-Review check removed here!
        navigate(`/company-portal/${company.id}/dashboard`, { replace: true });
        return;
      }

      // 3. CHECK AFFILIATES
      const { data: affiliate } = await supabase
        .from("affiliates")
        .select("id, status")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (affiliate) {
        await minLoadTime;
        // 🛑 Under-Review check removed here!
        navigate(`/affiliate-portal/${affiliate.id}/dashboard`, { replace: true });
        return;
      }

      // 4. CHECK AGENTS
      const { data: agent } = await supabase
        .from("company_user_profiles")
        .select("company_id")
        .eq("id", userId)
        .maybeSingle();

      if (agent) {
        await minLoadTime;
        navigate(`/company-portal/${agent.company_id}/dashboard`, { replace: true });
        return;
      }

      // 5. CHECK CLIENTS (Consumers)
      const { data: client } = await supabase
        .from("clients")
        .select("id, status")
        .eq("auth_user_id", userId)
        .maybeSingle();

      if (client) {
        await minLoadTime;
        // 🛑 Under-Review check removed here!
        navigate("/my-dashboard", { replace: true });
        return;
      }

      // --- 🩹 SELF-HEALING FALLBACK ---
      // If user is authenticated but has NO DB row, they might be an orphaned signup
      if (user.user_metadata?.role === "individual" || user.user_metadata?.role === "client") {
        await minLoadTime;
        navigate("/my-dashboard", { replace: true }); // Let IndividualDashboard.jsx heal the profile
        return;
      }

      throw new Error("No account profile found. Please contact support.");
    } catch (err) {
      console.error("Routing Exception:", err);
      setMessage(`❌ Login Failed: ${err.message}`);
      setRoleChecking(false);
      setIsLoading(false);
    }
  };

  const handleNext = (e) => {
    e.preventDefault();
    if (!email.includes("@")) {
      setMessage("Please enter a valid email.");
      return;
    }
    setMessage("");
    setStep(2);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    setMessage("");
    setIsLoading(true);
    
    // Clean Email for search
    const cleanEmail = email.trim().toLowerCase();

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });
      if (error) {
        setMessage(`❌ ${error.message}`);
        setIsLoading(false);
        return;
      }
      if (data.user) {
        await handleRoleRouting(data.user);
      }
    } catch (err) {
      setMessage("❌ An unexpected error occurred.");
      setIsLoading(false);
    }
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setMessage("");
    setIsLoading(true);

    const cleanEmail = email.trim().toLowerCase();
    const cleanPhone = phone.trim();

    if (signupType === "company" && !companyName.trim()) {
      setMessage("❌ Company Name is required.");
      setIsLoading(false);
      return;
    }

    try {
      // 1. Create Auth User (The DB Trigger will handle insertions & verification)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: fullName,
            phone: cleanPhone,
            company_name: companyName,
            signup_type: signupType,
            role: signupType, 
          },
        },
      });

      if (authError) throw authError;

      setMessage("✅ Account created! Logging you in...");

      // 2. Force Login. 
      // Even though the DB trigger verified the email, signUp doesn't return a session if "Confirm Email" is turned on in Supabase settings. We must log them in manually right after.
      const { data: loginData, error: loginError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password,
      });

      if (loginError) {
        throw new Error("Account created, but auto-login failed. Please try logging in manually.");
      }

      if (loginData.user) {
        await handleRoleRouting(loginData.user);
      }

    } catch (err) {
      console.error("Signup Error:", err);
      setMessage(`❌ ${err.message}`);
      setIsLoading(false);
    }
  };

  const toggleMode = (targetMode) => {
    setMode(targetMode);
    setMessage("");
    setStep(1);
    setPassword("");
  };

  if (roleChecking) {
    return <InquiryLoader />;
  }

  return (
    <Container fluid className="vh-100 overflow-hidden p-0 fade-in-element login-bg ">
      <video autoPlay muted loop playsInline className="bg-video">
        <source src={LoginBG} type="video/mp4" />
      </video>

      <Row className="h-100 g-0 flex-nowrap">
        <Col className="d-flex align-items-center justify-content-center position-relative login-form-animate">
          <div className="position-absolute top-0 start-0 p-4" style={{ zIndex: 30 }}>
            <Link to="/" className="btn bg-white button-text-color border d-flex align-items-center gap-2 text-muted fw-medium px-3 shadow-sm">
              <i className="bi bi-arrow-left"></i> Back to Home
            </Link>
          </div>

          <div className="w-100 p-5 rounded-4 shadow-4 login-content-fade bg-white" style={{ maxWidth: "700px" }}>
            <div className="mb-4">
              <div className="d-flex align-items-center gap-2 mb-2 button-text-color">
                <i className="bi bi-layers-fill fs-4"></i>
                <span className="fw-bold h5 mb-0 tracking-tight">Hidden Partner Cloud ™</span>
              </div>
              <h2 className="fw-bold mb-1">
                {mode === "login" ? "Welcome back" : "Create Account"}
              </h2>
              <p className="text-muted">
                {mode === "login"
                  ? "Please enter your details to sign in."
                  : `Sign up as ${signupType === "individual" ? "an Individual" : signupType === "company" ? "a Partner" : "an Affiliate"}.`}
              </p>
            </div>

            {message && (
              <Alert variant={message.includes("✅") ? "success" : "danger"} className="py-2 small shadow-sm">
                {message}
              </Alert>
            )}

            {mode === "login" ? (
              <>
                {step === 1 && (
                  <Form onSubmit={handleNext}>
                    <Form.Group className="mb-4">
                      <Form.Label className="small text-uppercase fw-bold text-muted">Email Address</Form.Label>
                      <Form.Control
                        type="email"
                        placeholder="name@example.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        autoFocus
                        required
                        size="lg"
                        className="bg-light border-0"
                      />
                    </Form.Group>
                    <div className="d-grid">
                      <Button variant="dark" size="lg" type="submit" className="fw-bold py-2">
                        Continue &rarr;
                      </Button>
                    </div>
                  </Form>
                )}
                {step === 2 && (
                  <Form onSubmit={handleLogin}>
                    <div className="d-flex align-items-center justify-content-between mb-4 p-2 rounded-3 bg-light border">
                      <div className="d-flex align-items-center overflow-hidden">
                        <div className="bg-white rounded-circle p-1 d-flex align-items-center justify-content-center me-2 shadow-sm" style={{ width: "32px", height: "32px" }}>
                          <i className="bi bi-person-fill text-secondary"></i>
                        </div>
                        <span className="text-dark fw-medium text-truncate">{email}</span>
                      </div>
                      <Button variant="link" className="text-decoration-none fw-bold button-text-color small" onClick={() => { setStep(1); setMessage(""); }}>
                        Change
                      </Button>
                    </div>
                    <Form.Group className="mb-2">
                      <Form.Label className="small text-uppercase fw-bold text-muted">Password</Form.Label>
                      <Form.Control
                        type="password"
                        placeholder="••••••••"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        autoFocus
                        required
                        size="lg"
                        className="bg-light border-0"
                      />
                    </Form.Group>
                    <div className="text-end mb-4">
                      <Link to="/reset-password" class="text-decoration-none small text-muted hover-underline">
                        Forgot password?
                      </Link>
                    </div>
                    <div className="d-grid">
                      <Button variant="dark" size="lg" type="submit" disabled={isLoading} className="fw-bold py-2">
                        {isLoading ? <Spinner size="sm" animation="border" /> : "Sign In"}
                      </Button>
                    </div>
                  </Form>
                )}
              </>
            ) : (
              <div className="step-1-enter">
                <Nav variant="pills" className="nav-pills-custom mb-4 bg-light p-1 rounded-3" justify activeKey={signupType}>
                  <Nav.Item>
                    <Nav.Link eventKey="individual" onClick={() => setSignupType("individual")} className="small fw-bold rounded-3">Individual</Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link eventKey="company" onClick={() => setSignupType("company")} className="small fw-bold rounded-3">Partner</Nav.Link>
                  </Nav.Item>
                  <Nav.Item>
                    <Nav.Link eventKey="affiliate" onClick={() => setSignupType("affiliate")} className="small fw-bold rounded-3">Affiliate</Nav.Link>
                  </Nav.Item>
                </Nav>

                <Form onSubmit={handleSignUp}>
                  <Form.Group className="mb-3">
                    <Form.Label className="small text-uppercase fw-bold text-muted">Full Name</Form.Label>
                    <Form.Control type="text" placeholder="John Doe" value={fullName} onChange={(e) => setFullName(e.target.value)} required className="bg-light border-0" />
                  </Form.Group>

                  {signupType === "company" && (
                    <Form.Group className="mb-3">
                      <Form.Label className="small text-uppercase fw-bold text-muted">Company Name</Form.Label>
                      <Form.Control type="text" placeholder="Acme Credit Solutions" value={companyName} onChange={(e) => setCompanyName(e.target.value)} required className="bg-light border-0" />
                    </Form.Group>
                  )}

                  <Form.Group className="mb-3">
                    <Form.Label className="small text-uppercase fw-bold text-muted">Phone Number</Form.Label>
                    <Form.Control type="tel" placeholder="(555) 123-4567" value={phone} onChange={(e) => setPhone(e.target.value)} required className="bg-light border-0" />
                  </Form.Group>

                  <Form.Group className="mb-3">
                    <Form.Label className="small text-uppercase fw-bold text-muted">Email Address</Form.Label>
                    <Form.Control type="email" placeholder="name@example.com" value={email} onChange={(e) => setEmail(e.target.value)} required className="bg-light border-0" />
                  </Form.Group>

                  <Form.Group className="mb-4">
                    <Form.Label className="small text-uppercase fw-bold text-muted">Create Password</Form.Label>
                    <Form.Control type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required className="bg-light border-0" />
                  </Form.Group>

                  <div className="d-grid">
                    <Button variant="primary" size="lg" type="submit" disabled={isLoading} className="fw-bold py-2 shadow-sm">
                      {isLoading ? <Spinner size="sm" animation="border" /> : "Create Account"}
                    </Button>
                  </div>
                </Form>
              </div>
            )}

            <div className="mt-5 pt-4 border-top text-center">
              {mode === "login" ? (
                <>
                  <p className="text-muted small mb-1">New here?</p>
                  <button onClick={() => toggleMode("signup")} className="btn btn-link p-0 text-decoration-none fw-bold button-text-color small">Create an Account &rarr;</button>
                </>
              ) : (
                <p className="text-muted small mb-0">Already have an account? <button onClick={() => toggleMode("login")} className="btn btn-link button-text-color p-0 text-decoration-none fw-bold">Log In</button></p>
              )}
            </div>
          </div>
        </Col>
      </Row>
    </Container>
  );
}