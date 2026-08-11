import React from 'react';
import { Navbar, Nav, NavDropdown, Container, Spinner } from 'react-bootstrap';
import { Link, useNavigate } from 'react-router-dom';
import { useAffiliateAuth } from '../../context/AffiliateAuthContext';
import { supabase } from '../../supabaseClient';

export default function AffiliateNavibar() {
  const { affiliateName, user, loading } = useAffiliateAuth();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/affiliate-portal/login'); // Redirect to affiliate login after logout
  };

  const userEmail = user?.email || 'My Account';

  return (
    <Navbar bg="light" expand="lg" className="shadow-sm">
      <Container>
        <Navbar.Brand as={Link} to="." className="fw-bold">
          🤝 {affiliateName || 'Affiliate Portal'}
        </Navbar.Brand>
        <Navbar.Toggle aria-controls="affiliate-navbar-nav" />
        <Navbar.Collapse id="affiliate-navbar-nav">
          <Nav className="ms-auto">
            <Nav.Link as={Link} to="." active={location.pathname.endsWith('dashboard')}>
              Dashboard
            </Nav.Link>

            {loading ? (
              <Spinner animation="border" size="sm" as="span" className="ms-2" />
            ) : (
              <NavDropdown title={userEmail} id="affiliate-user-dropdown" align="end">
                <NavDropdown.Item as={Link} to="./profile">
                  Edit Profile
                </NavDropdown.Item>
                <NavDropdown.Divider />
                <NavDropdown.Item onClick={handleLogout}>
                  Sign Out
                </NavDropdown.Item>
              </NavDropdown>
            )}
          </Nav>
        </Navbar.Collapse>
      </Container>
    </Navbar>
  );
}