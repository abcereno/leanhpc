import React, { useState } from "react";
import { Container, Card, Form, Row, Col, Button, Spinner, Alert, InputGroup } from "react-bootstrap";
import { supabase } from "../../../supabaseClient";

export default function ProfileStep1({ client, onSave, clientId }) {
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleSubmit = async (e) => {
      e.preventDefault();
      setLoading(true);
      setMessage(null);

      const formData = new FormData(e.target);
      const fullAddress = formData.get('address'); 
      
      try {
          const { error } = await supabase.from('clients').update({
              address: fullAddress,
              dob: formData.get('dob'),
              ssn: formData.get('ssn'),
              phone: formData.get('phone')
          }).eq('id', clientId);

          if (error) throw error;

          setMessage({ type: "success", text: "✅ Personal details updated successfully!" });
          if (onSave) onSave(); // Triggers the refetch in IndividualLayout

          // Auto-hide the success message after 3 seconds
          setTimeout(() => setMessage(null), 3000);
      } catch (err) {
          setMessage({ type: "danger", text: `❌ Could not save changes: ${err.message}` });
      } finally {
          setLoading(false);
      }
  };

  return (
      <>
          <Card className="shadow-sm border-0 rounded-4">
              <Card.Body className="p-4 p-md-5">
                  {message && (
                      <Alert variant={message.type} className="mb-4 fw-medium border-0 shadow-sm">
                          {message.text}
                      </Alert>
                  )}

                  <Form onSubmit={handleSubmit}>
                      <Row className="g-4 mb-4">
                          
                          {/* Row 1: Full Name & Phone */}
                          <Col md={6}>
                              <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase tracking-wide">Full Name</Form.Label>
                                  <InputGroup>
                                      <InputGroup.Text className="bg-light border-0 text-muted">
                                          <i className="bi bi-person-fill"></i>
                                      </InputGroup.Text>
                                      <Form.Control 
                                          size="lg" 
                                          defaultValue={client?.full_name || ""} 
                                          disabled 
                                          className="bg-light border-0 text-muted"
                                      />
                                  </InputGroup>
                                  <Form.Text className="text-muted small mt-2">
                                      <i className="bi bi-info-circle me-1"></i> Name changes require support.
                                  </Form.Text>
                              </Form.Group>
                          </Col>

                          <Col md={6}>
                              <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase tracking-wide">Phone Number</Form.Label>
                                  <InputGroup>
                                      <InputGroup.Text className="bg-light border-0 text-muted">
                                          <i className="bi bi-telephone-fill"></i>
                                      </InputGroup.Text>
                                      <Form.Control 
                                          type="tel" 
                                          name="phone" 
                                          size="lg"
                                          defaultValue={client?.phone || ""} 
                                          placeholder="(555) 123-4567"
                                          required 
                                          className="border-light-subtle shadow-none bg-light focus-ring"
                                      />
                                  </InputGroup>
                              </Form.Group>
                          </Col>

                          {/* Row 2: DOB & SSN */}
                          <Col md={6}>
                              <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase tracking-wide">Date of Birth</Form.Label>
                                  <InputGroup>
                                      <InputGroup.Text className="bg-light border-0 text-muted">
                                          <i className="bi bi-calendar-event-fill"></i>
                                      </InputGroup.Text>
                                      <Form.Control 
                                          type="date" 
                                          name="dob" 
                                          size="lg"
                                          defaultValue={client?.dob || ""} 
                                          required 
                                          className="border-light-subtle shadow-none bg-light focus-ring"
                                      />
                                  </InputGroup>
                              </Form.Group>
                          </Col>

                          <Col md={6}>
                              <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase tracking-wide">Social Security Number</Form.Label>
                                  <InputGroup>
                                      <InputGroup.Text className="bg-light border-0 text-muted">
                                          <i className="bi bi-shield-lock-fill"></i>
                                      </InputGroup.Text>
                                      <Form.Control 
                                          type="text" 
                                          name="ssn" 
                                          size="lg"
                                          defaultValue={client?.ssn || ""} 
                                          placeholder="AAA-GG-SSSS" 
                                          required 
                                          className="border-light-subtle shadow-none bg-light focus-ring"
                                      />
                                  </InputGroup>
                              </Form.Group>
                          </Col>

                          {/* Row 3: Address (Full Width) */}
                          <Col md={12}>
                              <Form.Group>
                                  <Form.Label className="small fw-bold text-muted text-uppercase tracking-wide">Full Home Address</Form.Label>
                                  <InputGroup>
                                      <InputGroup.Text className="bg-light border-0 text-muted">
                                          <i className="bi bi-geo-alt-fill"></i>
                                      </InputGroup.Text>
                                      <Form.Control 
                                          type="text" 
                                          name="address" 
                                          size="lg"
                                          defaultValue={client?.address || ""} 
                                          placeholder="123 Main St, Apt 4B, City, ST 12345"
                                          required 
                                          className="border-light-subtle shadow-none bg-light focus-ring"
                                      />
                                  </InputGroup>
                              </Form.Group>
                          </Col>

                      </Row>
                      
                      <div className="d-flex justify-content-end pt-4 border-top mt-2">
                          <Button 
                              type="submit" 
                              variant="primary" 
                              size="lg"
                              className="px-5 fw-bold rounded-pill shadow-sm"
                              disabled={loading}
                          >
                              {loading ? (
                                  <><Spinner size="sm" animation="border" className="me-2" /> Saving...</>
                              ) : (
                                  <><i className="bi bi-check2-circle me-2"></i> Save Changes</>
                              )}
                          </Button>
                      </div>
                  </Form>
              </Card.Body>
          </Card>
      </>
  );
}