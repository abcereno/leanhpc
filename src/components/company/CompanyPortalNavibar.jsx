import React from 'react';
import { Navbar, Nav, NavDropdown, Container, Spinner } from 'react-bootstrap';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useCompanyAuth } from '../../context/CompanyAuthContext';

export default function CompanyNavibar() {
  // Use the signOut from our custom context!
  const { companyName, user, loading, signOut } = useCompanyAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const handleLogout = async () => {
    // 1. Call the proper context signOut
    await signOut();
    // 2. Redirect to the MAIN login page (as defined in your Routes)
    navigate('/login', { replace: true });
  };

  const userEmail = user?.email || 'My Account';

  return (
    <Navbar bg="light" expand="lg" className="shadow-sm">
        <Navbar.Brand as={Link} to="." className="fw-bold text-info">
          🏢 {companyName || 'Company Portal'}
        </Navbar.Brand>
        
        <Navbar.Toggle aria-controls="company-navbar-nav" />
        
        <Navbar.Collapse id="company-navbar-nav">
          <Nav className="ms-auto align-items-center">
            <Nav.Link 
              as={Link} 
              to="." 
              className="text-info" 
              active={location.pathname.endsWith('dashboard')}
            >
              Dashboard
            </Nav.Link>
            
            {loading ? (
              <Spinner animation="border" size="sm" variant="info" className="ms-2" />
            ) : (
              <NavDropdown 
                title={<span className="text-info">{userEmail}</span>} 
                id="company-user-dropdown" 
                align="end"
              >
                <NavDropdown.Item as={Link} to="./profile" className="text-info">
                  Edit Profile
                </NavDropdown.Item>
                <NavDropdown.Divider />
                <NavDropdown.Item onClick={handleLogout} className="text-info">
                  Sign Out
                </NavDropdown.Item>
              </NavDropdown>
            )}
          </Nav>
        </Navbar.Collapse>
    </Navbar>
  );
}