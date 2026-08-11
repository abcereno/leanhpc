import React, { useState, useEffect } from 'react';
import { supabase } from '../../supabaseClient';
import { useToast } from "../shared/ui/ToastNotifier";
import {
  Form,
  Button,
  Container,
  Card,
  Alert,
  Spinner,
  Tabs,
  Tab,
  Table,
  Badge,
  Modal,
  Row,
  Col
} from 'react-bootstrap';

// 👇 NEW: Define your subscription tiers and their case limits
const PLAN_TIERS = {
  FREE_TRIAL: { label: "Free Trial", cases: 2, users: 1, price: "$0" },
  BETA: { label: "Beta", cases: 25, users: 3, price: "$149/mo" },
  GROWTH: { label: "Growth", cases: 50, users: 7, price: "$299/mo" },
  PROFESSIONAL: { label: "Professional", cases: 100, users: 15, price: "$499/mo" },
  ENTERPRISE: { label: "Enterprise", cases: -1, users: "Unlimited", price: "Custom" } // -1 indicates unlimited in the logic
};

export default function AddCompanyForm({ onCompanyAdded }) {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState('new');
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: '', variant: '' });

  // Subscription Modal State
  const [showSubModal, setShowSubModal] = useState(false);
  const [subLoading, setSubLoading] = useState(false);
  const [selectedCompany, setSelectedCompany] = useState(null);
  const [subForm, setSubForm] = useState({ plan: 'FREE_TRIAL', isActive: false });

  // Company Receipt Review State (payment_verifications rows with company_id
  // set — see CompanyPaymentModal.jsx, which is what companies use to submit
  // these from their locked-out portal. Reviewed here, inline, instead of a
  // separate page, since this table is already "where the controls are".)
  // companyReceipts holds EVERY receipt (pending/approved/rejected), not
  // just pending ones, so "Review Receipts" is a full history per company.
  const [companyReceipts, setCompanyReceipts] = useState([]);
  const [showReceiptListModal, setShowReceiptListModal] = useState(false);
  const [receiptListCompany, setReceiptListCompany] = useState(null);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState(null);
  const [receiptImageUrl, setReceiptImageUrl] = useState(null);
  const [receiptLoading, setReceiptLoading] = useState(false);

  const [form, setForm] = useState({
    companyId: '',
    name: '',    
    email: '',
    phone: '',
    password: '',
  });

  useEffect(() => {
    loadCompanies();
    loadCompanyReceipts();
  }, []);

  async function loadCompanies() {
    const { data } = await supabase
      .from('companies')
      .select('id, company_name, credit_analysis_count, credit_analysis_limit, is_subscription_active, subscription_plan')
      .order('company_name');
    setCompanies(data || []);
  }

  async function loadCompanyReceipts() {
    const { data, error } = await supabase
      .from('payment_verifications')
      .select('*')
      .not('company_id', 'is', null)
      .order('created_at', { ascending: false });

    if (error) {
      console.error("Error loading company receipts:", error);
      return;
    }
    setCompanyReceipts(data || []);
  }

  const receiptsForCompany = (companyId) => companyReceipts.filter((r) => r.company_id === companyId);
  const pendingCountForCompany = (companyId) =>
    receiptsForCompany(companyId).filter((r) => r.status === 'pending').length;

  const openReceiptList = (company) => {
    setReceiptListCompany(company);
    setShowReceiptListModal(true);
  };

  // --- RECEIPT REVIEW HANDLERS ---
  const handleViewReceipt = async (record) => {
    setSelectedReceipt(record);
    setReceiptImageUrl(null);
    setShowReceiptListModal(false);
    setShowReceiptModal(true);

    try {
      const { data, error } = await supabase.storage
        .from('payment-proofs')
        .createSignedUrl(record.screenshot_url, 60);

      if (error) throw error;
      setReceiptImageUrl(data.signedUrl);
    } catch (err) {
      console.error("Could not load receipt image:", err);
    }
  };

  const handleApproveReceipt = async () => {
    if (!selectedReceipt) return;
    setReceiptLoading(true);
    try {
      const { error: verifyError } = await supabase
        .from('payment_verifications')
        .update({ status: 'approved', verified_at: new Date().toISOString() })
        .eq('id', selectedReceipt.id);
      if (verifyError) throw verifyError;

      const { error: companyError } = await supabase
        .from('companies')
        .update({ is_subscription_active: true })
        .eq('id', selectedReceipt.company_id);
      if (companyError) throw companyError;

      setMessage({ text: `✅ Receipt approved — subscription reactivated.`, variant: 'success' });
      setShowReceiptModal(false);
      setShowReceiptListModal(true);
      await Promise.all([loadCompanies(), loadCompanyReceipts()]);
    } catch (err) {
      console.error("Receipt approval failed:", err);
      setMessage({ text: `❌ Failed to approve receipt: ${err.message}`, variant: 'danger' });
    } finally {
      setReceiptLoading(false);
    }
  };

  const handleRejectReceipt = async () => {
    if (!selectedReceipt) return;
    if (!window.confirm("Reject this receipt? The company's subscription will stay inactive.")) return;

    setReceiptLoading(true);
    try {
      const { error } = await supabase
        .from('payment_verifications')
        .update({ status: 'rejected', verified_at: new Date().toISOString() })
        .eq('id', selectedReceipt.id);
      if (error) throw error;

      setMessage({ text: `⚠️ Receipt rejected.`, variant: 'warning' });
      setShowReceiptModal(false);
      setShowReceiptListModal(true);
      await loadCompanyReceipts();
    } catch (err) {
      console.error("Receipt rejection failed:", err);
      setMessage({ text: `❌ Failed to reject receipt: ${err.message}`, variant: 'danger' });
    } finally {
      setReceiptLoading(false);
    }
  };

  // --- FORM HANDLERS ---
  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const resetForm = () => {
    setForm({ companyId: '', name: '', email: '', phone: '', password: '' });
  };

  // --- COMPANY CREATION SUBMIT ---
  async function handleSubmit(e) {
    e.preventDefault();
    setLoading(true);
    setMessage({ text: '', variant: '' });

    try {
      const isNewCompany = activeTab === 'new';

      if (!form.email || !form.password || !form.name) {
        throw new Error('Please fill in all required fields.');
      }
      if (!isNewCompany && !form.companyId) {
        throw new Error('Please select a company.');
      }

      const functionName = isNewCompany ? 'create-company' : 'create-company-owner';
      const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/${functionName}`;

      const payload = isNewCompany
        ? { companyName: form.name, email: form.email, password: form.password, phone: form.phone }
        : { companyId: form.companyId, fullName: form.name, email: form.email, password: form.password };

      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${import.meta.env.VITE_SUPABASE_ANON_KEY}`,
        },
        body: JSON.stringify(payload),
      });

      const result = await res.json();
      
      if (!res.ok) {
        throw new Error(result?.error || 'Request failed');
      }

      setMessage({
        text: isNewCompany
          ? `✅ Company "${form.name}" created successfully!`
          : `✅ Owner account for ${form.email} created and linked!`,
        variant: 'success'
      });

      resetForm();
      if (onCompanyAdded) onCompanyAdded();
      loadCompanies();

    } catch (err) {
      console.error(err);
      setMessage({ text: `❌ Error: ${err.message}`, variant: 'danger' });
    } finally {
      setLoading(false);
    }
  }

  // --- SUBSCRIPTION MODAL HANDLERS ---
  const openSubModal = (company) => {
    setSelectedCompany(company);
    setSubForm({
        plan: company.subscription_plan || 'FREE_TRIAL',
        isActive: company.is_subscription_active || false
    });
    setShowSubModal(true);
  };

  const handleSaveSubscription = async () => {
      setSubLoading(true);
      try {
          const selectedTier = PLAN_TIERS[subForm.plan];

          const { error } = await supabase
              .from('companies')
              .update({ 
                  subscription_plan: subForm.plan,
                  // We update both limits to match their active cases tier
                  credit_analysis_limit: selectedTier.cases,
                  eligibility_checks_limit: selectedTier.cases,
                  is_subscription_active: subForm.isActive 
              })
              .eq('id', selectedCompany.id);

          if (error) throw error;
          
          await loadCompanies();
          setShowSubModal(false);
      } catch (err) {
          console.error("Subscription switch failure:", err);
          addToast({ title: "Update Failed", message: "Database Error: Failed to update subscription limits.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
      } finally {
          setSubLoading(false);
      }
  };

  return (
    <Container className="mt-4">
      <Card className="shadow-sm border-0">
        <Card.Header className="bg-dark text-white py-3">
          <Card.Title as="h4" className="mb-0">
            <i className="bi bi-building-gear me-2"></i>Company Management
          </Card.Title>
        </Card.Header>
        <Card.Body className="p-4">
          <Tabs 
            activeKey={activeTab} 
            onSelect={(k) => { setActiveTab(k); setMessage({text:'', variant:''}); }} 
            className="mb-4"
          >
            {/* TAB 1: NEW COMPANY */}
            <Tab eventKey="new" title="Create New Company">
              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-bold">Company Name *</Form.Label>
                  <Form.Control name="name" value={form.name} onChange={handleChange} placeholder="e.g. Acme Credit Repair" required />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-bold">Admin Email *</Form.Label>
                  <Form.Control type="email" name="email" value={form.email} onChange={handleChange} required />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-bold">Phone</Form.Label>
                  <Form.Control name="phone" value={form.phone} onChange={handleChange} placeholder="(555) 555-5555" />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-bold">Initial Password *</Form.Label>
                  <Form.Control type="password" name="password" value={form.password} onChange={handleChange} minLength={6} required />
                </Form.Group>
                <Button variant="primary" type="submit" className="w-100 py-2 fw-bold" disabled={loading}>
                  {loading ? <Spinner size="sm" animation="border" /> : 'Create Company & Admin'}
                </Button>
              </Form>
            </Tab>

            {/* TAB 2: EXISTING COMPANY */}
            <Tab eventKey="existing" title="Add Owner to Existing Company">
              <Form onSubmit={handleSubmit}>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-bold">Select Company *</Form.Label>
                  <Form.Select name="companyId" value={form.companyId} onChange={handleChange} required>
                    <option value="">-- Select Company --</option>
                    {companies.map((c) => (<option key={c.id} value={c.id}>{c.company_name}</option>))}
                  </Form.Select>
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-bold">Owner Full Name *</Form.Label>
                  <Form.Control name="name" value={form.name} onChange={handleChange} placeholder="e.g. John Doe" required />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-bold">Owner Email *</Form.Label>
                  <Form.Control type="email" name="email" value={form.email} onChange={handleChange} required />
                </Form.Group>
                <Form.Group className="mb-3">
                  <Form.Label className="fw-bold">Password *</Form.Label>
                  <Form.Control type="password" name="password" value={form.password} onChange={handleChange} minLength={6} required />
                </Form.Group>
                <Button variant="outline-primary" type="submit" className="w-100 py-2 fw-bold" disabled={loading}>
                  {loading ? <Spinner size="sm" animation="border" /> : 'Create & Link Owner'}
                </Button>
              </Form>
            </Tab>

            {/* 👇 TAB 3: NEW LIVE SUBSCRIPTION MANAGER 👇 */}
            <Tab eventKey="subscriptions" title="Manage Partner Subscriptions">
                <Table responsive striped hover className="align-middle border small mt-2">
                    <thead className="bg-light">
                        <tr>
                            <th>Company Partner</th>
                            <th className="text-center">Active Cases (Usage)</th>
                            <th className="text-center">Current Plan</th>
                            <th className="text-center">Status</th>
                            <th className="text-center">Receipt</th>
                            <th className="text-end">Administrative Adjustments</th>
                        </tr>
                    </thead>
                    <tbody>
                        {companies.map(co => {
                            const planKey = co.subscription_plan || 'FREE_TRIAL';
                            const planInfo = PLAN_TIERS[planKey] || PLAN_TIERS['FREE_TRIAL'];
                            const isUnlimited = planInfo.cases === -1;
                            const isAtLimit = !isUnlimited && (co.credit_analysis_count >= planInfo.cases);
                            const receiptCount = receiptsForCompany(co.id).length;
                            const pendingCount = pendingCountForCompany(co.id);

                            return (
                            <tr key={co.id}>
                                <td className="fw-bold text-dark">{co.company_name}</td>
                                <td className="text-center fw-bold">
                                    <Badge bg={isAtLimit && co.is_subscription_active ? "danger" : "dark"}>
                                        {co.credit_analysis_count || 0} / {isUnlimited ? "∞" : planInfo.cases} Cases
                                    </Badge>
                                </td>
                                <td className="text-center">
                                    <span className="fw-bold text-primary">{planInfo.label}</span>
                                </td>
                                <td className="text-center">
                                    <Badge bg={co.is_subscription_active ? "success" : "secondary"} className="p-2 text-uppercase">
                                        {co.is_subscription_active ? "🟢 Active" : "🔴 Suspended/Trial"}
                                    </Badge>
                                </td>
                                <td className="text-center">
                                    <Button
                                        variant={pendingCount > 0 ? "warning" : "outline-light"}
                                        size="sm"
                                        className={`fw-bold px-3 ${pendingCount > 0 ? '' : 'cmd-btn'}`}
                                        onClick={() => openReceiptList(co)}
                                        disabled={receiptCount === 0}
                                    >
                                        <i className="bi bi-receipt me-2"></i> Review Receipts
                                        {receiptCount > 0 && (
                                            <Badge bg={pendingCount > 0 ? "dark" : "secondary"} className="ms-2">{receiptCount}</Badge>
                                        )}
                                    </Button>
                                </td>
                                <td className="text-end">
                                    <Button
                                        variant="outline-light"
                                        size="sm"
                                        className="fw-bold px-3"
                                        onClick={() => openSubModal(co)}
                                    >
                                        <i className="bi bi-pencil-square me-2"></i> Edit Plan
                                    </Button>
                                </td>
                            </tr>
                        )})}
                    </tbody>
                </Table>
            </Tab>
          </Tabs>

          {message.text && (
            <Alert className="mt-3 text-center" variant={message.variant}>
              {message.text}
            </Alert>
          )}
        </Card.Body>
      </Card>

      {/* 👇 SUBSCRIPTION EDIT MODAL 👇 */}
      <Modal show={showSubModal} onHide={() => setShowSubModal(false)} centered backdrop="static">
          <Modal.Header closeButton className="bg-light">
              <Modal.Title className="fw-bold h5 mb-0">
                  <i className="bi bi-wallet2 text-primary me-2"></i> Manage Subscription
              </Modal.Title>
          </Modal.Header>
          <Modal.Body className="p-4">
              <h5 className="fw-bold text-center mb-4">{selectedCompany?.company_name}</h5>
              
              <Form.Group className="mb-4">
                  <Form.Label className="fw-bold text-uppercase small text-muted">Select Billing Tier</Form.Label>
                  <Form.Select 
                      size="lg" 
                      value={subForm.plan} 
                      onChange={(e) => setSubForm({...subForm, plan: e.target.value})}
                      className="fw-bold shadow-sm"
                  >
                      {Object.entries(PLAN_TIERS).map(([key, tier]) => (
                          <option key={key} value={key}>
                              {tier.label} — {tier.price} ({tier.cases === -1 ? 'Unlimited' : tier.cases} Cases)
                          </option>
                      ))}
                  </Form.Select>
              </Form.Group>

              <Card className="bg-light border-0 mb-4 p-3 rounded-3">
                  <Row className="text-center">
                      <Col xs={6} className="border-end">
                          <small className="text-muted text-uppercase fw-bold d-block mb-1" style={{fontSize: '0.7rem'}}>Case Limit</small>
                          <span className="fw-bold fs-5 text-dark">
                              {PLAN_TIERS[subForm.plan]?.cases === -1 ? 'Unlimited' : PLAN_TIERS[subForm.plan]?.cases}
                          </span>
                      </Col>
                      <Col xs={6}>
                          <small className="text-muted text-uppercase fw-bold d-block mb-1" style={{fontSize: '0.7rem'}}>User Limit</small>
                          <span className="fw-bold fs-5 text-dark">{PLAN_TIERS[subForm.plan]?.users}</span>
                      </Col>
                  </Row>
              </Card>

              <Form.Group>
                  <div className="d-flex justify-content-between align-items-center p-3 border rounded-3 bg-white shadow-sm">
                      <div>
                          <Form.Label className="fw-bold mb-0 d-block">Account Status</Form.Label>
                          <small className="text-muted">Controls whether this company can log into their portal at all.</small>
                      </div>
                      <Form.Check
                          type="switch"
                          id="active-switch"
                          className="fs-4 m-0"
                          checked={subForm.isActive}
                          onChange={(e) => setSubForm({...subForm, isActive: e.target.checked})}
                      />
                  </div>
              </Form.Group>

              {!subForm.isActive && (
                  <Alert variant="warning" className="small mb-0 mt-3">
                      <i className="bi bi-exclamation-triangle-fill me-2"></i>
                      Saving this will immediately lock <strong>{selectedCompany?.company_name}</strong> out of their
                      entire company portal, replacing their dashboard with a "Subscription Required" screen until
                      you switch this back on.
                  </Alert>
              )}
          </Modal.Body>
          <Modal.Footer className="bg-light">
              <Button variant="outline-light" className="fw-bold cmd-btn" onClick={() => setShowSubModal(false)}>Cancel</Button>
              <Button variant="primary" className="fw-bold px-4" onClick={handleSaveSubscription} disabled={subLoading}>
                  {subLoading ? <Spinner size="sm" className="me-2"/> : <i className="bi bi-save me-2"></i>}
                  Apply Updates
              </Button>
          </Modal.Footer>
      </Modal>

      {/* 👇 COMPANY RECEIPT LIST MODAL — full history (pending/approved/rejected) 👇 */}
      <Modal show={showReceiptListModal} onHide={() => setShowReceiptListModal(false)} centered size="lg">
          <Modal.Header closeButton className="border-0 pb-0">
              <Modal.Title className="fw-bold">
                  Payment Receipts — {receiptListCompany?.company_name}
              </Modal.Title>
          </Modal.Header>
          <Modal.Body className="p-4">
              {receiptListCompany && receiptsForCompany(receiptListCompany.id).length === 0 ? (
                  <div className="text-center text-muted py-4">No receipts submitted yet.</div>
              ) : (
                  <Table responsive hover className="align-middle small mb-0">
                      <thead className="bg-light">
                          <tr>
                              <th>Submitted</th>
                              <th>Amount</th>
                              <th>Status</th>
                              <th className="text-end">Action</th>
                          </tr>
                      </thead>
                      <tbody>
                          {receiptListCompany && receiptsForCompany(receiptListCompany.id).map((r) => (
                              <tr key={r.id}>
                                  <td>{new Date(r.created_at).toLocaleString()}</td>
                                  <td className="fw-bold">${Number(r.amount_due).toFixed(2)}</td>
                                  <td>
                                      <Badge bg={r.status === 'approved' ? 'success' : r.status === 'rejected' ? 'danger' : 'warning'} text={r.status === 'pending' ? 'dark' : undefined} className="text-uppercase">
                                          {r.status}
                                      </Badge>
                                  </td>
                                  <td className="text-end">
                                      <Button variant="outline-light" size="sm" className="fw-bold cmd-btn" onClick={() => handleViewReceipt(r)}>
                                          <i className="bi bi-image me-1"></i> View
                                      </Button>
                                  </td>
                              </tr>
                          ))}
                      </tbody>
                  </Table>
              )}
          </Modal.Body>
          <Modal.Footer className="border-0 bg-light">
              <Button variant="outline-light" className="fw-bold cmd-btn" onClick={() => setShowReceiptListModal(false)}>
                  Close
              </Button>
          </Modal.Footer>
      </Modal>

      {/* 👇 COMPANY RECEIPT DETAIL MODAL — view image, approve/reject if still pending 👇 */}
      <Modal show={showReceiptModal} onHide={() => setShowReceiptModal(false)} centered size="lg">
          <Modal.Header closeButton className="border-0 pb-0">
              <Modal.Title className="fw-bold">
                  Payment Receipt — {companies.find(c => c.id === selectedReceipt?.company_id)?.company_name}
              </Modal.Title>
          </Modal.Header>
          <Modal.Body className="text-center p-4">
              <div className="mb-3">
                  <span className="fw-bold fs-4 text-success">${Number(selectedReceipt?.amount_due || 0).toFixed(2)}</span>
                  <div className="text-muted small">
                      Submitted {selectedReceipt?.created_at ? new Date(selectedReceipt.created_at).toLocaleString() : ''}
                  </div>
                  {selectedReceipt?.status !== 'pending' && (
                      <div className="mt-2">
                          <Badge bg={selectedReceipt?.status === 'approved' ? 'success' : 'danger'} className="text-uppercase p-2">
                              {selectedReceipt?.status}
                          </Badge>
                      </div>
                  )}
              </div>
              {receiptImageUrl ? (
                  <img
                      src={receiptImageUrl}
                      alt="Payment Receipt"
                      className="img-fluid rounded shadow-sm border"
                      style={{ maxHeight: '60vh', objectFit: 'contain' }}
                  />
              ) : (
                  <Spinner animation="border" />
              )}
          </Modal.Body>
          <Modal.Footer className="border-0 bg-light">
              <Button
                  variant="outline-light"
                  className="fw-bold cmd-btn"
                  onClick={() => {
                      setShowReceiptModal(false);
                      setShowReceiptListModal(true);
                  }}
                  disabled={receiptLoading}
              >
                  Back to List
              </Button>
              {selectedReceipt?.status === 'pending' && (
                  <>
                      <Button variant="danger" className="fw-bold" onClick={handleRejectReceipt} disabled={receiptLoading}>
                          <i className="bi bi-x-lg me-2"></i> Reject
                      </Button>
                      <Button variant="success" className="fw-bold px-4" onClick={handleApproveReceipt} disabled={receiptLoading}>
                          {receiptLoading ? <Spinner size="sm" className="me-2" /> : <i className="bi bi-check-lg me-2"></i>}
                          Approve & Activate
                      </Button>
                  </>
              )}
          </Modal.Footer>
      </Modal>

    </Container>
  );
}