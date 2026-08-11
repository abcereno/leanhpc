import React, { useState } from "react";
import { Outlet } from "react-router-dom"; 
import { Navbar, Button, Offcanvas } from "react-bootstrap";
import Sidebar from "./Sidebar";
import Topbar from "../IndividualPortal/Topbar"; // Optional, if you have a top header

export default function Layout() {
  // State to control the mobile slide-out menu
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const handleCloseMobileMenu = () => setShowMobileMenu(false);

  return (
    <div className="d-flex position-relative" style={{ minHeight: "100vh", backgroundColor: "#15192b" }}>
      
      {/* 1. Desktop Fixed Sidebar (Hidden on mobile via 'd-none d-lg-block') */}
      <div 
        className="d-none d-lg-block" 
        style={{ 
            width: "280px", 
            position: "fixed", 
            top: 0, 
            bottom: 0, 
            zIndex: 1000,
            overflowY: "auto" // Allows scrolling if sidebar gets too tall
        }}
      >
        <Sidebar />
      </div>

      {/* 2. Mobile Offcanvas Sidebar (Slide-out drawer) */}
      <Offcanvas 
        show={showMobileMenu} 
        onHide={handleCloseMobileMenu} 
        className="border-0" 
        style={{ width: "280px", backgroundColor: "#15192b" }}
      >
        <Offcanvas.Header closeButton closeVariant="white" className="border-bottom border-secondary border-opacity-25">
          <Offcanvas.Title className="fw-bold text-white">Menu</Offcanvas.Title>
        </Offcanvas.Header>
        <Offcanvas.Body className="p-0">
          {/* Pass the close function so clicking a link closes the menu */}
          <Sidebar onClose={handleCloseMobileMenu} />
        </Offcanvas.Body>
      </Offcanvas>

      {/* 3. Main Content Area */}
      <div className="flex-grow-1 d-flex flex-column layout-main-content">
        
        {/* CSS to handle the dynamic margin based on screen size */}
        {/* Mobile Topbar with Burger Button (Hidden on Desktop) */}
        <Navbar variant="dark" expand="lg" className="d-lg-none px-3 py-2 border-bottom border-secondary border-opacity-25 sticky-top" style={{ backgroundColor: "#15192b" }}>
            <Button variant="outline-light" className="p-1 me-3 border-0" onClick={() => setShowMobileMenu(true)}>
                <i className="bi bi-list" style={{ fontSize: '2rem' }}></i>
            </Button>
            <Navbar.Brand className="fw-bold text-white m-0">CLIENT PORTAL</Navbar.Brand>
        </Navbar>

        {/* <Topbar /> */}

        <main className="flex-grow-1 p-3 p-md-4">
          <Outlet /> 
        </main>
      </div>
      
    </div>
  );
}