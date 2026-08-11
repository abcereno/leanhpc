import { useState } from 'react';
import { supabase } from '../../../supabaseClient';
import { Link } from "react-router-dom"; // Use Link instead of <a> for SPA speed
import LoginBG from "../../../assets/login-bg-video.mp4"; // Keep branding consistent

export default function ResetPassword() {
  const [email, setEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false); // Added loading state
  const [feedback, setFeedback] = useState({ message: '', status: '' });

  const handleReset = async (e) => {
    e.preventDefault();
    setIsLoading(true);
    setFeedback({ message: '', status: '' });

    // Sanitize email exactly like your Login.jsx
    const cleanEmail = email.trim().toLowerCase();

    const { error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
      // This MUST match the path where UpdatePassword.jsx is routed
      redirectTo: `${window.location.origin}/update-password`,
    });

    if (error) {
      setFeedback({ message: `❌ ${error.message}`, status: 'error' });
    } else {
      setFeedback({ message: '✅ Reset link sent! Please check your inbox.', status: 'success' });
    }
    setIsLoading(false);
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
                    <i className="bi bi-layers-fill fs-4"></i>
                    <span className="fw-bold h5 mb-0 tracking-tight">Hidden Partner Cloud ™</span>
                </div>
                <h2 className="fw-bold">Reset Password</h2>
                <p className="text-muted small">Enter your email to receive a secure recovery link.</p>
              </div>

              {feedback.message && (
                <div className={`alert ${feedback.status === 'success' ? 'alert-success' : 'alert-danger'} py-2 small shadow-sm mb-4`} role="alert">
                  {feedback.message}
                </div>
              )}

              <form onSubmit={handleReset}>
                <div className="mb-4">
                  <label htmlFor="email" className="small text-uppercase fw-bold text-muted mb-2">Email Address</label>
                  <input
                    id="email"
                    type="email"
                    className="form-control form-control-lg bg-light border-0"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={isLoading}
                  />
                </div>

                <div className="d-grid">
                  <button type="submit" className="btn btn-dark btn-lg fw-bold" disabled={isLoading}>
                    {isLoading ? 'Sending...' : 'Send Reset Link'}
                  </button>
                </div>
              </form>

              <div className="text-center mt-4 border-top pt-3">
                <Link to="/" className="text-decoration-none small fw-bold button-text-color">
                  <i className="bi bi-arrow-left me-1"></i> Back to Login
                </Link>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}