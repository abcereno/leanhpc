import React from "react";
import { Container, Row, Col, Card, Button, ProgressBar } from "react-bootstrap";
import img1 from "../../../assets/minicourse.jpeg";
import img2 from "../../../assets/guide.jpeg";
import img3 from "../../../assets/tradelines.jpeg";
import img4 from "../../../assets/credit strong.png";
import img5 from "../../../assets/rent reporters.jpeg";
import img6 from "../../../assets/business credit.jpeg";
import img7 from "../../../assets/business funding.jpeg";
import img8 from "../../../assets/start franchise.jpeg";
import img9 from "../../../assets/tradelines options.jpeg";

// Reusable Image Card Component with Lock Overlay and URL functionality
const ActionCard = ({ title, buttonText, imgSrc, locked, url }) => {
  return (
    <Card 
      className="h-100 border-0 shadow-sm text-white hover-lift" 
      style={{ 
        borderRadius: "15px", 
        overflow: "hidden",
        minHeight: "280px",
        position: "relative",
        cursor: locked || buttonText === "Coming Soon" ? "not-allowed" : "pointer"
      }}
      onClick={() => {
        if (!locked && url && url !== "#") window.open(url, "_blank", "noopener,noreferrer");
      }}
    >
      {/* 1. Background Image */}
      <div 
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          backgroundImage: `url(${imgSrc})`,
          backgroundSize: "100% 100%",
          backgroundRepeat: "no-repeat",
          backgroundPosition: "center",
          zIndex: 0
        }}
      />

      {/* 2. Gradient Overlay (Ensures text/button at the bottom is readable) */}
      <div 
        style={{
          position: "absolute",
          top: 0, left: 0, right: 0, bottom: 0,
          background: "linear-gradient(to top, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.1) 100%)",
          zIndex: 1
        }}
      />

      {/* 3. Locked Overlay (Only shows if locked = true) */}
      {locked && (
        <div 
          style={{
            position: "absolute",
            top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: "rgba(21, 25, 43, 0.75)", 
            backdropFilter: "blur(6px)", 
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2
          }}
        >
          <div 
            className="d-flex align-items-center justify-content-center bg-dark rounded-circle mb-2 shadow"
            style={{ width: "60px", height: "60px", border: "1px solid #2d334a" }}
          >
            <i className="bi bi-lock-fill text-white fs-3"></i>
          </div>
          <span className="fw-bold tracking-widest text-uppercase small text-secondary">Locked</span>
        </div>
      )}

      {/* 4. Card Content (Title & Button) */}
      <Card.Body className="d-flex flex-column justify-content-end p-4" style={{ zIndex: 3, position: "relative" }}>
        {title && <h5 className="fw-bold mb-3">{title}</h5>}
        
        <Button 
          variant={locked ? "secondary" : "light"} 
          disabled={locked || buttonText === "Coming Soon"}
          className="w-100 fw-bold border-0 shadow-sm"
          style={{ 
            color: locked || buttonText === "Coming Soon" ? "#adb5bd" : "#333", 
            borderRadius: "8px",
            padding: "10px",
            fontSize: "0.9rem"
          }}
        >
          {locked ? "Locked" : buttonText}
        </Button>
      </Card.Body>
    </Card>
  );
};

export default function FreshStartClassroom() {
  // Data for the cards updated with links and unlocked status
  const sections = [
    {
      heading: "Start Here",
      locked: false, 
      cards: [
        {
          // title: "Mini Course",
          btn: "Coming Soon",
          imgSrc: img1,
          url: "" // Temporarily removed so it doesn't open a blank page
        },
        {
          // title: "Download the Guide",
          btn: "Coming Soon",
          imgSrc: img2,
          url: "" // Temporarily removed so it doesn't open a blank page
        },
        {
          // title: "Tradelines Explained",
          btn: "Coming Soon",
          imgSrc: img3,
          url: "" 
        }
      ]
    },
    {
      heading: "Build My Credit Tools",
      locked: false, // 👈 UNLOCKED
      cards: [
        {
          title: "Boost up to 88 points",
          btn: "Build Credit",
          imgSrc: img4,
          url: "https://creditstrong.referralrock.com/l/3LATOYIA83/" // Credit Strong
        },
        {
          title: "Report Your Rent",
          btn: "Start Reporting",
          imgSrc: img5,
          url: "https://www.rentreporters.com/?clickref=1100lC85xsJb" // Rent Reporters
        },
        {
          title: "Business Credit",
          btn: "Build Business",
          imgSrc: img6,
          url: "https://tailorbrands.go2cloud.org/aff_c?offer_id=25&aff_id=6659" // Business Set Up (Tailor Brands)
        }
      ]
    },
    {
      heading: "Funding Pathways",
      locked: false, // 👈 UNLOCKED
      cards: [
        {
          title: "Business Funding",
          btn: "Get Funding-Ready",
          imgSrc: img7,
          url: "https://preferredfundinggroup.wufoo.com/forms/ztqx25v1s0f0px/" // Preferred Funding Group
        },
        {
          title: "Start My Franchise",
          btn: "See Franchise Path",
          imgSrc: img8,
          url: "https://www.ffcash.com/pre-approval/" // FF Cash
        },
        {
          title: "Tradelines (Purchase)",
          btn: "Explore Now",
          imgSrc: img9,
          url: "https://tradelinesupply.com/?cjdata=MXxOfDB8WXww&cjevent=927f3d871f3b11f1820e00840a82b82a" // AU Tradeline List
        }
      ]
    }
  ];

  return (
    <div style={{ backgroundColor: "#15192b", minHeight: "100vh", color: "#fff" }} className="p-4">
      <Container fluid>
        {/* Header Section */}
        <div className="mb-5">
          <h2 className="fw-bold mb-2">Fresh Start Classroom</h2>
          <p className="text-muted">Choose your path: Learn it • Build it • Fund it</p>
          
          {/* Progress Bar */}
          <div className="mt-4 p-3 rounded" style={{ backgroundColor: "#1e2337", border: "1px solid #2d334a" }}>
            <div className="d-flex justify-content-between align-items-center mb-2 small text-secondary">
              <span>Fresh Start Progress 100%</span>
              <span>6 of 6 Steps Completed</span>
            </div>
            <ProgressBar 
              now={100} 
              variant="success" 
              style={{ height: "8px", backgroundColor: "#2c3550" }} 
            />
          </div>
        </div>

        {/* Dynamic Card Sections */}
        {sections.map((section, sIndex) => (
          <div key={sIndex} className="mb-5">
            <div className="d-flex align-items-center mb-3">
                <h5 className="fw-bold mb-0">{section.heading}</h5>
                {section.locked && (
                    <span className="badge bg-secondary bg-opacity-50 text-light ms-3">
                        <i className="bi bi-lock-fill me-1"></i> Section Locked
                    </span>
                )}
            </div>
            
            <Row className="g-4">
              {section.cards.map((card, cIndex) => (
                <Col key={cIndex} md={6} lg={4}>
                  <ActionCard 
                    title={card.title}
                    buttonText={card.btn}
                    imgSrc={card.imgSrc}
                    locked={section.locked} 
                    url={card.url}
                  />
                </Col>
              ))}
            </Row>
          </div>
        ))}

        {/* 🛑 MANDATORY DISCLOSURE SECTION 🛑 */}
        <div className="mt-5 pt-4 border-top border-secondary border-opacity-25 text-center">
          <p className="small text-muted mb-0" style={{ maxWidth: "800px", margin: "0 auto", lineHeight: "1.6" }}>
            <strong>Disclosure:</strong> Hidden Partner Cloud provides access to trusted third-party resources through its affiliated entities, including LT Student Credit EDU, LT Student Credit SCH. We may receive compensation if you choose to use these providers.
          </p>
        </div>

      </Container>
    </div>
  );
}