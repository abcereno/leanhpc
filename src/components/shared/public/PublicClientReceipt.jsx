import { useParams } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "../../../supabaseClient";

import ClientHeader from "../../admin/client-profile/ClientHeader";
import InquiriesThread from "../../admin/client-profile/InquiriesThread";
import experian from "../../../assets/experian.png";
import transunion from "../../../assets/transunion.png";
import equifax from "../../../assets/equifax.svg";
import { Row, Col } from "react-bootstrap";

export default function PublicClientReceipt() {
  const { token } = useParams();
  const [clientId, setClientId] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchClientByToken = async () => {
      const nowUTC = new Date().toISOString();

      const { data, error } = await supabase
        .from("clients")
        .select("id")
        .eq("public_token", token)
        .gt("public_token_expires_at", nowUTC)
        .single();

      if (data && !error) {
        setClientId(data.id);
      } else {
        setClientId(null);
      }

      setLoading(false);
    };

    fetchClientByToken();
  }, [token]);

  if (loading) return <p className="text-center mt-5">🔄 Loading receipt...</p>;
  if (!clientId)
    return (
      <p className="text-center mt-5 text-danger">
        ❌ Invalid or expired link.
      </p>
    );

  return (
    <div className="container py-4">
      <ClientHeader clientId={clientId} readonly />
      <Row>
        <Col className="d-flex flex-column justify-content-end align-items-center">
          <img className="img-fluid bureau-logo" src={experian} alt="experian" />
          <h1 className="d-flex justify-content-center align-items-center">-</h1>
        </Col>
        <Col className="d-flex flex-column justify-content-end align-items-center">
          <img className="img-fluid bureau-logo" src={transunion} alt="transunion" />
          <h1 className="d-flex justify-content-center align-items-center">-</h1>
        </Col>
        <Col className="d-flex flex-column justify-content-end align-items-center">
          <img className="img-fluid bureau-logo" src={equifax} alt="equifax" />
          <h1 className="d-flex justify-content-center align-items-center">-</h1>
        </Col>
      </Row>
      <InquiriesThread clientId={clientId} readonly />
    </div>
  );
}
