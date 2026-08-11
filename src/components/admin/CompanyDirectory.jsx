import { Card, Container, Row, Col, Spinner, Alert, Button } from 'react-bootstrap';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useCompanyDirectory } from '../../hooks/useCompanyDirectory';
import InquiryLoader from '../shared/ui/InquiryLoader';
export default function CompanyDirectory() {
  const { user, hasPermission } = useAuth();
  const { companies, loading, error } = useCompanyDirectory();

  if (!user || !hasPermission("view_partners")) {
    return <p className="text-center mt-5">You are not authorized to access this page.</p>;
  }

  if (loading) {
    return (
      <InquiryLoader/>
    );
  }

  if (error) {
    return (
      <Container className="mt-5">
        <Alert variant="danger">{error}</Alert>
      </Container>
    );
  }

  return (
    <Container className="py-4">
      <h3 className="mb-4">Registered Companies</h3>
      <Row xs={1} md={2} lg={3} className="g-4">
        {companies.map((company) => (
          <Col key={company.id}>
            <Card className="h-100 shadow-sm border-0">
              <Card.Body>
                <h5 className="card-title mb-2">{company.company_name}</h5>
                <p className="text-muted mb-3">
                  Registered: {new Date(company.created_at).toLocaleDateString()}
                </p>
                <Link to={`/company/${company.id}/add-clients`}>
                  <Button variant="primary" className="w-100">
                    Add Client
                  </Button>
                </Link>
              </Card.Body>
            </Card>
          </Col>
        ))}
      </Row>
    </Container>
  );
}