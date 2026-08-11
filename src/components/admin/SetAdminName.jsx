import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { useAuth } from "../../context/AuthContext";

const nameRegex = /^[A-Za-z\s]+$/;

export default function SetAdminName() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [message, setMessage] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      navigate("/login");
      return;
    }

    const validateAdmin = async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (error || !data || data.role !== "admin") {
        navigate("/unauthorized");
      } else {
        setLoading(false);
      }
    };

    validateAdmin();
  }, [user, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);

    const trimmed = fullName.trim();

    if (!trimmed) return setMessage("❌ Full name is required.");
    if (!nameRegex.test(trimmed)) return setMessage("❌ Only letters and spaces allowed.");

    const { error } = await supabase
      .from("profiles")
      .update({ full_name: trimmed })
      .eq("id", user.id);

    if (error) {
      setMessage(`❌ Error: ${error.message}`);
    } else {
      navigate("/clients");
    }
  };

  if (loading) return null;

  return (
    <div className="container mt-5">
      <div className="row justify-content-center">
        <div className="col-md-6 col-lg-5">
          <div className="card shadow-sm border-0">
            <div className="card-body p-4">
              <h4 className="text-center mb-3">Set Your Admin Name</h4>

              {message && <div className="alert alert-danger">{message}</div>}

              <form onSubmit={handleSubmit}>
                <div className="mb-3">
                  <label htmlFor="fullName" className="form-label">
                    Full Name
                  </label>
                  <input
                    id="fullName"
                    type="text"
                    className="form-control"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Enter your full name"
                    autoFocus
                    required
                  />
                </div>

                <button type="submit" className="btn btn-primary w-100">
                  Save & Continue
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
