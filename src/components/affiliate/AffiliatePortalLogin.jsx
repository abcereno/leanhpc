import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { supabase } from '../../supabaseClient';
import { useAffiliateAuth } from '../../context/AffiliateAuthContext';

export default function AffiliatePortalLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  const { affiliateId, loading } = useAffiliateAuth();

  // Auto-redirect if session already exists
  useEffect(() => {
    if (!loading && affiliateId) {
      navigate(`/affiliate-portal/${affiliateId}/dashboard`);
    }
  }, [affiliateId, loading, navigate]);

  const handleLogin = async (e) => {
    e.preventDefault();
    setMessage('');
    setIsLoading(true);

    try {
      // 1. Attempt Auth
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        setMessage(`❌ ${error.message}`);
        setIsLoading(false);
        return;
      }

      // 2. SECURITY GUARD: Check if user is an Affiliate
      if (data.user) {
        const { data: profile, error: profileError } = await supabase
          .from('affiliate_user_profiles')
          .select('id')
          .eq('id', data.user.id)
          .single();

        if (profileError || !profile) {
          // 🛑 STOP: User is not an affiliate.
          await supabase.auth.signOut();
          setMessage('❌ Access Denied: This account is not authorized for the Affiliate Portal.');
          setIsLoading(false);
          return;
        }

        // ✅ SUCCESS: Context handles the redirect
      }

    } catch (err) {
      setMessage('❌ An unexpected error occurred. Please try again.');
      console.error(err);
      setIsLoading(false);
    }
  };

  return (
    <div className="container login-container">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-5">
          <div className="card shadow-lg mt-5 border-0">
            <div className="card-body p-5">
              
              <div className="mb-4">
                <Link to="/" className="text-decoration-none text-muted small">
                  &larr; Back to Portal Selection
                </Link>
              </div>

              <div className="text-center mb-4">
                <div className="mb-3" style={{ fontSize: "2.5rem" }}>🤝</div>
                <h2 className="fw-bold">Affiliate Login</h2>
                <p className="text-muted">Partners & Referrals</p>
              </div>

              {message && (
                <div className="alert alert-danger mb-4" role="alert">
                  {message}
                </div>
              )}

              <form onSubmit={handleLogin}>
                <div className="mb-3">
                  <label className="form-label">Email address</label>
                  <input
                    type="email"
                    className="form-control form-control-lg"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label">Password</label>
                  <input
                    type="password"
                    className="form-control form-control-lg"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                </div>

                <div className="d-grid mb-3">
                  <button type="submit" className="btn btn-primary btn-lg" disabled={isLoading || loading}>
                    {isLoading ? 'Verifying...' : 'Sign In'}
                  </button>
                </div>
              </form>
              
              <div className="text-center mt-4">
                <p className="text-muted small">
                  <Link to="/reset-password" className="text-decoration-none">Forgot Password?</Link>
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}