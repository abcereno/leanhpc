import React, { useState, useEffect } from 'react';
import { Card, Form, Button, Spinner, Alert, Row, Col } from 'react-bootstrap';
import { supabase } from '../../supabaseClient';

export default function CompanySettingsPanel({ companyId }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [message, setMessage] = useState({ type: '', text: '' });

  const [formData, setFormData] = useState({
    company_name: '',
    contact_email: '',
    phone: '',
    website: '',
    logo_url: ''
  });

  // Fetch initial data
  useEffect(() => {
    if (!companyId) return;

    const fetchCompanySettings = async () => {
      setLoading(true);
      try {
        const { data, error } = await supabase
          .from('companies')
          .select('company_name, contact_email, phone, website, logo_url')
          .eq('id', companyId)
          .single();

        if (error) throw error;
        
        if (data) {
          setFormData({
            company_name: data.company_name || '',
            contact_email: data.contact_email || '',
            phone: data.phone || '',
            website: data.website || '',
            logo_url: data.logo_url || ''
          });
        }
      } catch (err) {
        console.error('Error fetching company settings:', err);
        setMessage({ type: 'danger', text: 'Failed to load settings.' });
      } finally {
        setLoading(false);
      }
    };

    fetchCompanySettings();
  }, [companyId]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Uploads to the "comment-uploads" bucket rather than "clients" — every
  // other write into "clients" is scoped to a per-client-id path
  // (clients/{clientId}/..., see AddClientForm.jsx/CoverLetterAssets.jsx),
  // which is almost certainly why this previously failed: a company logo
  // isn't a client document, so a company_logos/{file} path doesn't match
  // whatever RLS policy that bucket enforces, and the upload was silently
  // rejected. "comment-uploads" is already public-read and already proven
  // to accept flat, unscoped authenticated uploads (see
  // utils/pasteImageUpload.js) — no new bucket/policy needed.
  const handleLogoUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setUploadingLogo(true);
    setMessage({ type: '', text: '' });

    try {
      const fileExt = file.name.split('.').pop();
      // Unique file name to prevent caching issues; company-scoped prefix
      // for traceability even though the bucket itself doesn't enforce it.
      const fileName = `company-logo-${companyId}-${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('comment-uploads')
        .upload(fileName, file, { upsert: true, contentType: file.type || undefined });

      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('comment-uploads')
        .getPublicUrl(fileName);

      if (publicUrlData?.publicUrl) {
        setFormData(prev => ({ ...prev, logo_url: publicUrlData.publicUrl }));
        setMessage({ type: 'success', text: 'Logo uploaded! Click "Save Changes" to apply.' });
      }
    } catch (err) {
      console.error('Logo upload error:', err);
      setMessage({ type: 'danger', text: 'Failed to upload logo. Ensure your file is an image.' });
    } finally {
      setUploadingLogo(false);
    }
  };

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage({ type: '', text: '' });

    try {
      const { error } = await supabase
        .from('companies')
        .update({
          company_name: formData.company_name,
          contact_email: formData.contact_email,
          phone: formData.phone,
          website: formData.website,
          logo_url: formData.logo_url
        })
        .eq('id', companyId);

      if (error) throw error;

      setMessage({ type: 'success', text: 'Company settings updated successfully! Your PDFs are now whitelabeled.' });
      
      // Clear success message after 4 seconds
      setTimeout(() => setMessage({ type: '', text: '' }), 4000);
    } catch (err) {
      console.error('Error saving company settings:', err);
      setMessage({ type: 'danger', text: 'Failed to save settings. Please try again.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="d-flex justify-content-center align-items-center h-100">
        <Spinner animation="border" style={{ color: '#38bdf8' }} />
      </div>
    );
  }

  return (
    <div className="p-2 p-md-4">
      <div className="mb-4">
        <h4 className="fw-bold text-white mb-1"><i className="bi bi-building-gear me-2" style={{ color: '#38bdf8' }}></i>Company Settings</h4>
        <p style={{ color: '#94a3b8' }} className="small">Customize your whitelabel branding for PDFs and client-facing interfaces.</p>
      </div>

      {message.text && (
        <Alert variant={message.type} className="fw-bold border-0 shadow-sm rounded-3">
          <i className={`bi ${message.type === 'success' ? 'bi-check-circle-fill' : 'bi-exclamation-triangle-fill'} me-2`}></i>
          {message.text}
        </Alert>
      )}

      <Card className="border-0 shadow-sm rounded-4 overflow-hidden mb-4" style={{ backgroundColor: '#1e293b' }}>
        <Card.Header className="py-3 border-bottom" style={{ backgroundColor: '#0f172a', borderColor: '#334155 !important' }}>
          <h6 className="fw-bold mb-0 text-white">Whitelabel Branding</h6>
        </Card.Header>
        <Card.Body className="p-4">
          <Form onSubmit={handleSave}>
            
            <Row className="g-4 mb-4">
              <Col md={6}>
                <Form.Group>
                  <Form.Label className="small fw-bold text-uppercase" style={{ color: '#94a3b8' }}>Company Name</Form.Label>
                  <Form.Control 
                    type="text" 
                    name="company_name"
                    value={formData.company_name} 
                    onChange={handleChange}
                    required
                    style={{ backgroundColor: '#0f172a', color: '#f8fafc', border: '1px solid #334155' }} 
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label className="small fw-bold text-uppercase" style={{ color: '#94a3b8' }}>Support Email</Form.Label>
                  <Form.Control 
                    type="email" 
                    name="contact_email"
                    value={formData.contact_email} 
                    onChange={handleChange}
                    required
                    style={{ backgroundColor: '#0f172a', color: '#f8fafc', border: '1px solid #334155' }} 
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label className="small fw-bold text-uppercase" style={{ color: '#94a3b8' }}>Support Phone</Form.Label>
                  <Form.Control 
                    type="text" 
                    name="phone"
                    value={formData.phone} 
                    onChange={handleChange}
                    style={{ backgroundColor: '#0f172a', color: '#f8fafc', border: '1px solid #334155' }} 
                  />
                </Form.Group>
              </Col>
              <Col md={6}>
                <Form.Group>
                  <Form.Label className="small fw-bold text-uppercase" style={{ color: '#94a3b8' }}>Website URL</Form.Label>
                  <Form.Control 
                    type="text" 
                    name="website"
                    value={formData.website} 
                    onChange={handleChange}
                    placeholder="e.g., yourwebsite.com"
                    style={{ backgroundColor: '#0f172a', color: '#f8fafc', border: '1px solid #334155' }} 
                  />
                </Form.Group>
              </Col>
            </Row>

            {/* 👇 NEW UPLOAD UI BLOCK 👇 */}
            <div className="p-3 mb-4 rounded-3 border" style={{ backgroundColor: 'rgba(0,0,0,0.1)', borderColor: '#334155' }}>
              <Row className="g-4 align-items-center">
                <Col md={6}>
                  <Form.Group>
                    <Form.Label className="small fw-bold text-uppercase" style={{ color: '#38bdf8' }}>Option 1: Upload Logo File</Form.Label>
                    <Form.Control 
                      type="file" 
                      accept="image/*"
                      onChange={handleLogoUpload}
                      disabled={uploadingLogo}
                      style={{ backgroundColor: '#0f172a', color: '#f8fafc', border: '1px solid #334155' }} 
                    />
                    {uploadingLogo && <Form.Text className="text-info fw-bold mt-2 d-block"><Spinner size="sm" className="me-2"/>Uploading image to cloud...</Form.Text>}
                  </Form.Group>
                </Col>
                <Col md={6}>
                  <Form.Group>
                    <Form.Label className="small fw-bold text-uppercase" style={{ color: '#94a3b8' }}>Option 2: Paste Existing URL</Form.Label>
                    <Form.Control 
                      type="url" 
                      name="logo_url"
                      value={formData.logo_url} 
                      onChange={handleChange}
                      placeholder="https://link-to-your-logo.png"
                      style={{ backgroundColor: '#0f172a', color: '#f8fafc', border: '1px solid #334155' }} 
                    />
                  </Form.Group>
                </Col>
              </Row>
            </div>

            {/* Logo Preview Block */}
            <div className="p-4 rounded-3 text-center border mb-4" style={{ backgroundColor: '#0f172a', borderColor: '#334155' }}>
              <div className="small fw-bold text-uppercase mb-3" style={{ color: '#64748b' }}>Logo Preview</div>
              {formData.logo_url ? (
                <img 
                  src={formData.logo_url} 
                  alt="Company Logo Preview" 
                  style={{ maxHeight: '80px', maxWidth: '250px', objectFit: 'contain' }}
                  onError={(e) => { e.target.src = ''; e.target.alt = 'Invalid Image URL'; }}
                />
              ) : (
                <div style={{ color: '#475569' }}><i className="bi bi-image fs-1 d-block mb-2"></i>No Logo Provided</div>
              )}
            </div>

            <div className="d-flex justify-content-end pt-3 border-top" style={{ borderColor: 'rgba(255,255,255,0.05) !important' }}>
              <Button type="submit" variant="info" className="fw-bold px-4 shadow-sm text-dark" style={{ backgroundColor: '#38bdf8', borderColor: '#38bdf8' }} disabled={saving || uploadingLogo}>
                {saving ? <><Spinner size="sm" className="me-2" /> Saving...</> : <><i className="bi bi-save me-2"></i> Save Changes</>}
              </Button>
            </div>
          </Form>
        </Card.Body>
      </Card>
    </div>
  );
}