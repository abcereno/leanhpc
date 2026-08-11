import { useEffect, useState } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import { Spinner } from "react-bootstrap";

export default function RequireIndividualAuth() {
  const [loading, setLoading] = useState(true);
  const [isIndividual, setIsIndividual] = useState(false);
  const location = useLocation();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      
      if (!session) {
        setLoading(false);
        return;
      }

      // Check metadata tag from signup
      const userType = session.user.user_metadata?.signup_type;
      
      // Allow if type is 'individual' OR if they just don't have a company/affiliate/admin role yet
      if (userType === 'individual') {
        setIsIndividual(true);
      }
      
      setLoading(false);
    };

    checkUser();
  }, []);

  if (loading) {
    return (
      <div className="vh-100 d-flex justify-content-center align-items-center">
        <Spinner animation="border" variant="primary" />
      </div>
    );
  }

  // If not logged in or not an individual, send to login
  if (!isIndividual) {
    // Optionally sign them out to break the loop if they are logged in as the wrong type
    // await supabase.auth.signOut(); 
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <Outlet />;
}