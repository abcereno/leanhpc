import { useParams, Outlet, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { Spinner, Container, Alert } from "react-bootstrap";
import { supabase } from "../../../supabaseClient";
export default function CompanyLayout() {
  const { companyId } = useParams();
  const [company, setCompany] = useState(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    const fetchCompany = async () => {
      const { data, error } = await supabase
        .from("companies")
        .select("*")
        .eq("id", companyId)
        .single();

      if (error || !data) {
        setNotFound(true);
      } else {
        setCompany(data);
      }

      setLoading(false);
    };

    fetchCompany();
  }, [companyId]);

  if (loading) {
    return (
      <Container className="text-center mt-5">
        <Spinner animation="border" />
        <p className="mt-3">Verifying company...</p>
      </Container>
    );
  }

  if (notFound) {
    return <Navigate to="/company" replace />;
  }

  return (
    <>
      <Outlet context={{ company }} />
    </>
  );
}
