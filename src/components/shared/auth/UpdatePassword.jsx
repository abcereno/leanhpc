import React, { useState } from "react";
import { supabase } from "../../../supabaseClient";
import { useNavigate } from "react-router-dom";
import LoginBG from "../../../assets/login-bg-video.mp4"; // Brought in your video background

export default function UpdatePassword() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ message: '', status: '' });
  const navigate = useNavigate();

  const handleUpdate = async (e) => {
    e.preventDefault();
    setFeedback({ message: '', status: '' });

    if (password !== confirmPassword) {
      return setFeedback({ status: "error", message: "Passwords do not match." });
    }

    if (password.length < 6) {
      return setFeedback({ status: "error", message: "Password must be at least 6 characters." });
    }

    setLoading(true);

    try {
      // This securely updates the password for the account attached to the email link
      const { error } = await supabase.auth.updateUser({
        password: password,
      });

      if (error) throw error;

      setFeedback({ status: "success", message: "Password set successfully! Taking you to your portal..." });
      
      // Send them to the root ("/") so LoginGate automatically routes them to /my-dashboard
      setTimeout(() => {
        navigate("/", { replace: true });
      }, 2000);

    } catch (err) {
      setFeedback({ status: "error", message: err.message });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="vh-100 overflow-hidden p-0 login-bg position-relative">
      <video autoPlay muted loop playsInline className="bg-video">
        <source src={LoginBG} type="video/mp4" />
      </video>

      <div className="container h-100 d-flex align-items-center justify-content-center">
        <div className="col-md-6 col-lg-5 position-relative" style={{ zIndex: 10 }}>
          <div className="card border-0 shadow-lg rounded-4 p-4">
            <div className="card-body">
              <div className="text-center mb-4">
                 <div className="d-flex align-items-center justify-content-center gap-2 mb-2 button-text-color">
                    <i className="bi bi-shield-lock-fill fs-4"></i>
                    <span className="fw-bold h5 mb-0 tracking-tight">Secure Portal</span>
                </div>
                <h2 className="fw-bold">Create New Password</h2>
                <p className="text-muted small">Enter your new password below to access your portal.</p>
              </div>

              {feedback.message && (
                <div className={`alert ${feedback.status === 'success' ? 'alert-success' : 'alert-danger'} py-2 small shadow-sm mb-4`} role="alert">
                  {feedback.message}
                </div>
              )}

              <form onSubmit={handleUpdate}>
                <div className="mb-3">
                  <label className="small text-uppercase fw-bold text-muted mb-2">New Password</label>
                  <input
                    type="password"
                    className="form-control form-control-lg bg-light border-0"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                <div className="mb-4">
                  <label className="small text-uppercase fw-bold text-muted mb-2">Confirm Password</label>
                  <input
                    type="password"
                    className="form-control form-control-lg bg-light border-0"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    disabled={loading}
                  />
                </div>

                <div className="d-grid">
                  <button type="submit" className="btn btn-dark btn-lg fw-bold" disabled={loading}>
                    {loading ? 'Securing Account...' : 'Set Password & Login'}
                  </button>
                </div>
              </form>

            </div>
          </div>
        </div>
      </div>
    </div>
  );
}