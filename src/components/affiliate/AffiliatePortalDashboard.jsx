// src/components/AffiliatePortal/AffiliatePortalDashboard.jsx
import React, { useEffect, useMemo, useState } from "react";
import {
  Container,
  Row,
  Col,
  Card,
  Button,
  Badge,
  Table,
  Spinner,
  ProgressBar,
  Alert,
} from "react-bootstrap";
import { supabase } from "../../supabaseClient";
import { useAffiliateAuth } from "../../context/AffiliateAuthContext";
import { useNavigate } from "react-router-dom";

const AffiliatePortalDashboard = () => {
  const navigate = useNavigate();
  const {
    user,
    affiliateId,
    affiliateName,
    loading: loadingAffiliateAuth,
  } = useAffiliateAuth();

  const [loading, setLoading] = useState(true);
  const [affiliate, setAffiliate] = useState(null);
  const [clients, setClients] = useState([]);
  const [error, setError] = useState("");

  // ---------------------------------------------------------------------------
  // Derived stats from clients + affiliate profile
  // ---------------------------------------------------------------------------

  const stats = useMemo(() => {
    if (!clients || clients.length === 0) {
      return {
        totalClients: 0,
        paidClients: 0,
        unpaidClients: 0,
        totalRevenue: 0,
        totalCommission: 0,
        pendingCommission: 0,
        paidCommission: 0,
        commissionRate: affiliate?.commission_rate ?? 0,
      };
    }

    const totalClients = clients.length;
    const paidClientsList = clients.filter((c) => c.is_paid);
    const paidClients = paidClientsList.length;
    const unpaidClients = totalClients - paidClients;

    const totalRevenue = paidClientsList.reduce(
      (sum, c) => sum + (Number(c.total_fee) || 0),
      0
    );

    const totalCommissionAll = clients.reduce(
      (sum, c) => sum + (Number(c.affiliate_commission_amount) || 0),
      0
    );

    const paidCommission = clients
      .filter((c) => c.affiliate_commission_paid)
      .reduce(
        (sum, c) => sum + (Number(c.affiliate_commission_amount) || 0),
        0
      );

    const pendingCommission = clients
      .filter((c) => c.is_paid && !c.affiliate_commission_paid)
      .reduce(
        (sum, c) => sum + (Number(c.affiliate_commission_amount) || 0),
        0
      );

    const commissionRate = Number(affiliate?.commission_rate) || 0;

    return {
      totalClients,
      paidClients,
      unpaidClients,
      totalRevenue,
      totalCommission: totalCommissionAll,
      paidCommission,
      pendingCommission,
      commissionRate,
    };
  }, [clients, affiliate]);

  const completionPercent =
    stats.totalClients === 0
      ? 0
      : Math.round((stats.paidClients / stats.totalClients) * 100);

  // ---------------------------------------------------------------------------
  // Load affiliate + clients
  // ---------------------------------------------------------------------------

  useEffect(() => {
    let isMounted = true;

    const loadData = async () => {
      if (loadingAffiliateAuth) {
        setLoading(true);
        return;
      }

      if (!affiliateId || !user) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError("");

      try {
        // 1) Affiliate profile (inc. new columns)
        const { data: affiliateRow, error: affError } = await supabase
          .from("affiliates")
          .select(
            `
            id,
            affiliate_name,
            commission_rate,
            payout_method,
            payout_account,
            phone,
            address,
            notes
          `
          )
          .eq("id", affiliateId)
          .maybeSingle();

        if (affError) {
          console.warn("Affiliate load error:", affError);
        }

        if (isMounted) {
          setAffiliate(affiliateRow || null);
        }

        // 2) Clients referred by this affiliate
        const { data: clientRows, error: clientError } = await supabase
          .from("clients")
          .select(
            `
            id,
            full_name,
            email,
            phone,
            status_stage,
            is_paid,
            total_fee,
            affiliate_commission_amount,
            affiliate_commission_paid,
            affiliate_commission_paid_at,
            created_at
          `
          )
          .eq("affiliate_id", affiliateId)
          .order("created_at", { ascending: false });

        if (clientError) {
          console.error("Affiliate clients load error:", clientError);
          if (isMounted) {
            setError(
              clientError.message ||
                "Unable to load your referred clients right now."
            );
          }
        }

        if (isMounted) {
          setClients(clientRows || []);
        }
      } catch (err) {
        console.error("Affiliate dashboard error:", err);
        if (isMounted) {
          setError(err.message || "Unexpected error loading dashboard.");
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadData();

    return () => {
      isMounted = false;
    };
  }, [affiliateId, user, loadingAffiliateAuth]);

  // ---------------------------------------------------------------------------
  // UI helpers
  // ---------------------------------------------------------------------------

  const formatMoney = (value) =>
    new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: "AUD",
      minimumFractionDigits: 2,
    }).format(Number(value) || 0);

  const formatDate = (value) => {
    if (!value) return "-";
    return new Date(value).toLocaleDateString("en-AU", {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  };

  const handleGoToProfile = () => {
    navigate("/affiliate-portal/profile");
  };

  // ---------------------------------------------------------------------------
  // Loading / fail states
  // ---------------------------------------------------------------------------

  if (loading || loadingAffiliateAuth) {
    return (
      <Container
        className="d-flex flex-column justify-content-center align-items-center"
        style={{ minHeight: "80vh" }}
      >
        <Spinner animation="border" />
        <div className="mt-3 text-muted">Loading your dashboard…</div>
      </Container>
    );
  }

  if (!affiliateId) {
    return (
      <Container className="py-5">
        <Alert variant="warning">
          <Alert.Heading>Affiliate account not linked</Alert.Heading>
          <p className="mb-0">
            We couldn&apos;t find an affiliate profile for your login. Please
            contact support so we can link your account.
          </p>
        </Alert>
      </Container>
    );
  }

  // ---------------------------------------------------------------------------
  // Main dashboard UI
  // ---------------------------------------------------------------------------

  return (
    <Container className="py-4">
      {/* Header / Hero */}
      <Row className="align-items-center mb-4 g-3">
        <Col xs={12} md={8}>
          <h1 className="mb-1" style={{ fontWeight: 700 }}>
            Hi, {affiliateName || affiliate?.affiliate_name || "Affiliate"} 👋
          </h1>
          <p className="text-muted mb-2">
            Here&apos;s a snapshot of your referrals, revenue, and commission.
          </p>
          <div className="d-flex flex-wrap gap-2 align-items-center">
            <Badge bg="primary" pill>
              {stats.totalClients} clients referred
            </Badge>
            <Badge bg="success" pill>
              {stats.paidClients} paid
            </Badge>
            {stats.unpaidClients > 0 && (
              <Badge bg="warning" text="dark" pill>
                {stats.unpaidClients} pending payment
              </Badge>
            )}
          </div>
        </Col>
        <Col
          xs={12}
          md={4}
          className="d-flex justify-content-md-end justify-content-start"
        >
          <Button
            variant="outline-secondary"
            className="me-2 mb-2"
            onClick={handleGoToProfile}
          >
            View / Edit Profile
          </Button>
        </Col>
      </Row>

      {/* Summary Cards */}
      <Row className="gy-3 mb-4">
        <Col xs={12} md={4}>
          <Card className="h-100 shadow-sm border-0">
            <Card.Body>
              <Card.Title>Total Commission</Card.Title>
              <h2 className="mt-2 mb-0" style={{ fontWeight: 700 }}>
                {formatMoney(stats.totalCommission)}
              </h2>
              <small className="text-muted">
                Lifetime commission from all referred clients
              </small>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} md={4}>
          <Card className="h-100 shadow-sm border-0">
            <Card.Body>
              <Card.Title>Pending vs Paid</Card.Title>
              <Row>
                <Col xs={6}>
                  <div className="small text-muted mb-1">Pending</div>
                  <div className="fw-bold">
                    {formatMoney(stats.pendingCommission)}
                  </div>
                </Col>
                <Col xs={6}>
                  <div className="small text-muted mb-1">Paid out</div>
                  <div className="fw-bold">
                    {formatMoney(stats.paidCommission)}
                  </div>
                </Col>
              </Row>
              <div className="mt-3">
                <div className="d-flex justify-content-between mb-1">
                  <span className="small text-muted">Paid clients</span>
                  <span className="small text-muted">
                    {completionPercent}% ({stats.paidClients}/{stats.totalClients}
                    )
                  </span>
                </div>
                <ProgressBar
                  now={completionPercent}
                  variant={completionPercent === 100 ? "success" : "info"}
                />
              </div>
            </Card.Body>
          </Card>
        </Col>

        <Col xs={12} md={4}>
          <Card className="h-100 shadow-sm border-0">
            <Card.Body>
              <Card.Title>Revenue from your clients</Card.Title>
              <h2 className="mt-2 mb-0" style={{ fontWeight: 700 }}>
                {formatMoney(stats.totalRevenue)}
              </h2>
              <small className="text-muted d-block mb-2">
                Total amount collected from paid clients you referred
              </small>
              <div className="small text-muted">
                Commission rate:{" "}
                <strong>
                  {Math.round((stats.commissionRate || 0) * 100)}%
                </strong>
              </div>
            </Card.Body>
          </Card>
        </Col>
      </Row>

      {/* Optional error */}
      {error && (
        <Row className="mb-3">
          <Col>
            <Alert variant="warning" className="mb-0">
              {error}
            </Alert>
          </Col>
        </Row>
      )}

      {/* Clients Table + Profile Snapshot */}
      <Row className="gy-4">
        <Col xs={12} lg={8}>
          <Card className="shadow-sm border-0">
            <Card.Header className="d-flex justify-content-between align-items-center bg-white">
              <div>
                <strong>Your Referred Clients</strong>
                <div className="text-muted small">
                  Track payments and commission on each client.
                </div>
              </div>
            </Card.Header>
            <Card.Body className="p-0">
              {clients.length === 0 ? (
                <div className="p-4 text-center text-muted">
                  No clients found yet. Once you start sending clients, they
                  will appear here.
                </div>
              ) : (
                <div className="table-responsive">
                  <Table hover className="mb-0 align-middle">
                    <thead className="table-light">
                      <tr>
                        <th>Client</th>
                        <th>Status</th>
                        <th>Paid?</th>
                        <th>Fee</th>
                        <th>Your Commission</th>
                        <th>Commission Status</th>
                        <th>Created</th>
                      </tr>
                    </thead>
                    <tbody>
                      {clients.map((c) => {
                        const fee = Number(c.total_fee) || 0;
                        const commission = Number(
                          c.affiliate_commission_amount
                        ) || 0;

                        return (
                          <tr key={c.id}>
                            <td>
                              <div className="fw-semibold">
                                {c.full_name || "Unnamed client"}
                              </div>
                              <div className="text-muted small">
                                {c.email || c.phone || "No contact details"}
                              </div>
                            </td>
                            <td>
                              <Badge bg="secondary" pill>
                                {c.status_stage || "New"}
                              </Badge>
                            </td>
                            <td>
                              {c.is_paid ? (
                                <Badge bg="success">Paid</Badge>
                              ) : (
                                <Badge bg="warning" text="dark">
                                  Pending
                                </Badge>
                              )}
                            </td>
                            <td>{formatMoney(fee)}</td>
                            <td>{formatMoney(commission)}</td>
                            <td>
                              {c.affiliate_commission_paid ? (
                                <span className="small">
                                  <Badge bg="success" className="me-1">
                                    Paid
                                  </Badge>
                                  <span className="text-muted">
                                    {formatDate(
                                      c.affiliate_commission_paid_at
                                    )}
                                  </span>
                                </span>
                              ) : c.is_paid ? (
                                <Badge bg="info" text="dark">
                                  Pending payout
                                </Badge>
                              ) : (
                                <Badge bg="light" text="dark">
                                  Awaiting client payment
                                </Badge>
                              )}
                            </td>
                            <td className="text-muted small">
                              {formatDate(c.created_at)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </div>
              )}
            </Card.Body>
          </Card>
        </Col>

        {/* Right column: Profile snapshot */}
        <Col xs={12} lg={4}>
          <Card className="shadow-sm border-0 mb-3">
            <Card.Body>
              <div className="d-flex align-items-center mb-3">
                <div
                  className="rounded-circle d-flex align-items-center justify-content-center me-3"
                  style={{
                    width: 48,
                    height: 48,
                    background:
                      "linear-gradient(135deg, rgba(13,110,253,0.15), rgba(32,201,151,0.2))",
                    fontWeight: 700,
                  }}
                >
                  {(affiliateName || user?.email || "A")[0]
                    ?.toUpperCase()
                    ?.toString()}
                </div>
                <div>
                  <div className="fw-semibold">
                    {affiliateName || affiliate?.affiliate_name || "Affiliate"}
                  </div>
                  <div className="text-muted small">{user?.email}</div>
                </div>
              </div>
              <div className="mb-2">
                <span className="text-muted small d-block mb-1">
                  Commission Rate
                </span>
                <strong>
                  {Math.round((stats.commissionRate || 0) * 100)}%
                </strong>
              </div>
              {affiliate?.payout_method && (
                <div className="mb-2">
                  <span className="text-muted small d-block mb-1">
                    Payout Method
                  </span>
                  <span className="small text-capitalize">
                    {affiliate.payout_method}
                  </span>
                </div>
              )}
              {affiliate?.payout_account && (
                <div className="mb-2">
                  <span className="text-muted small d-block mb-1">
                    Payout Account
                  </span>
                  <span className="small">{affiliate.payout_account}</span>
                </div>
              )}
              <Button
                variant="outline-primary"
                size="sm"
                className="mt-3"
                onClick={handleGoToProfile}
              >
                Update profile & payout details
              </Button>
            </Card.Body>
          </Card>

          <Card className="shadow-sm border-0">
            <Card.Body>
              <Card.Title className="mb-2">Tips to earn more 💡</Card.Title>
              <ul className="small text-muted mb-0 ps-3">
                <li>Follow up with clients who are still pending payment.</li>
                <li>
                  Make sure your payout details are up to date for smooth
                  commissions.
                </li>
                <li>
                  Talk to your account manager about promo campaigns or bundled
                  offers.
                </li>
              </ul>
            </Card.Body>
          </Card>
        </Col>
      </Row>
    </Container>
  );
};

export default AffiliatePortalDashboard;
