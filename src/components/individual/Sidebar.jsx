import React from "react";
import { Nav } from "react-bootstrap";
import { useToast } from "../shared/ui/ToastNotifier";

export default function Sidebar({ menuItems, activeTab, onTabChange, onLogout, hasVault, isPreviewMode, onClose }) {
  const { addToast } = useToast();

  // Dynamically group the menu items by their 'category' property
  const groupedItems = menuItems.reduce((acc, item) => {
    const cat = item.category || 'General';
    if (!acc[cat]) {
      acc[cat] = [];
    }
    acc[cat].push(item);
    return acc;
  }, {});

  // The only tabs allowed while in preview mode
  const allowedInPreview = ['dashboard', 'profile', 'configurator'];

  return (
    <div 
        className="d-flex flex-column h-100 py-4 px-3 border-end shadow-lg" 
        style={{ 
            minHeight: "100vh", 
            backgroundColor: "#0f172a", 
            borderColor: "rgba(255,255,255,0.05)"
        }}
    >
      
      {/* Brand */}
      <div className="d-flex align-items-center mb-4 text-decoration-none px-2 mt-1">
        <i className="bi bi-shield-check fs-3 text-primary me-2"></i>
        <span className="fs-5 fw-bold text-white tracking-wide" style={{ letterSpacing: "1px" }}>
          CLIENT PORTAL
        </span>
      </div>

      {/* Scrollable Navigation Area */}
      <div className="flex-grow-1 overflow-auto sidebar-scroll pe-2 position-relative">
        <Nav className="flex-column gap-1">
          {Object.entries(groupedItems).map(([category, items], index) => (
            <React.Fragment key={category}>
              
              {/* Premium Category Header / Separator */}
              <div 
                className={`fw-bold text-uppercase px-3 ${index > 0 ? 'mt-4' : 'mt-2'} mb-2`} 
                style={{ fontSize: "0.65rem", letterSpacing: "1.5px", color: "rgba(255,255,255,0.4)" }}
              >
                {category}
              </div>

              {/* Category Links */}
              {items.map((item) => {
                const isActive = activeTab === item.id;
                
                // Determine if this specific item should be locked out in preview mode
                const isItemLocked = isPreviewMode && !allowedInPreview.includes(item.id);
                
                let label = item.label;
                let icon = item.icon;
                
                if (item.id === "fresh-start" && !hasVault) {
                  label = "Course (Locked)";
                  icon = "bi bi-lock-fill text-warning"; 
                }

                // If the entire item is locked by preview mode, override the icon
                if (isItemLocked) {
                  icon = "bi bi-lock-fill";
                }

                return (
                  <Nav.Item key={item.id}>
                    <div
                      onClick={() => {
                          if (isItemLocked) {
                              addToast({ title: "Locked in Preview Mode", message: "Please request Admin Help to activate your full portal.", variant: "warning", icon: "bi-lock-fill" });
                              return;
                          }
                          onTabChange(item.id);
                          // Close the mobile menu if the user is on mobile
                          if (onClose) onClose();
                      }}
                      // 👇 FIX: Injected item.tourClass here so Joyride can target it 👇
                      className={`d-flex align-items-center rounded-3 mb-1 ${item.tourClass || ''}`}
                      style={{
                        cursor: isItemLocked ? "not-allowed" : "pointer",
                        color: isActive ? "#ffffff" : "rgba(255,255,255,0.6)",
                        backgroundColor: isActive ? "#0d6efd" : "transparent",
                        padding: "10px 16px",
                        transition: "all 0.2s ease",
                        fontWeight: isActive ? "700" : "500",
                        opacity: isItemLocked ? 0.4 : 1, 
                        boxShadow: isActive ? "0 4px 12px rgba(13, 110, 253, 0.2)" : "none"
                      }}
                      onMouseOver={(e) => {
                          if(!isActive && !isItemLocked) {
                              e.currentTarget.style.backgroundColor = "rgba(255,255,255,0.05)";
                              e.currentTarget.style.color = "#ffffff";
                          }
                      }}
                      onMouseOut={(e) => {
                          if(!isActive && !isItemLocked) {
                              e.currentTarget.style.backgroundColor = "transparent";
                              e.currentTarget.style.color = "rgba(255,255,255,0.6)";
                          }
                      }}
                    >
                      <i className={`${icon} me-3 fs-5 ${isItemLocked ? 'text-warning' : ''}`}></i>
                      <span style={{ fontSize: "0.9rem" }}>{label}</span>
                    </div>
                  </Nav.Item>
                );
              })}
            </React.Fragment>
          ))}
        </Nav>
      </div>

      {/* Footer / Sign Out */}
      <div className="mt-4 pt-3 border-top" style={{ borderColor: "rgba(255,255,255,0.05) !important" }}>
        <div 
            onClick={() => {
                if (onClose) onClose(); // Also close sidebar on logout just in case
                onLogout();
            }}
            className="p-2 rounded-3 d-flex align-items-center" 
            style={{ 
                backgroundColor: "rgba(220, 53, 69, 0.1)", 
                cursor: "pointer",
                transition: "background 0.2s"
            }}
            onMouseOver={(e) => e.currentTarget.style.backgroundColor = "rgba(220, 53, 69, 0.2)"}
            onMouseOut={(e) => e.currentTarget.style.backgroundColor = "rgba(220, 53, 69, 0.1)"}
        >
          <div className="rounded-circle bg-danger d-flex align-items-center justify-content-center text-white me-3 shadow-sm" style={{ width: 36, height: 36 }}>
            <i className="bi bi-box-arrow-right"></i>
          </div>
          <div className="small overflow-hidden">
            <div className="fw-bold text-white" style={{ fontSize: "0.9rem" }}>Sign Out</div>
            <div className="text-truncate" style={{ fontSize: "0.75rem", color: "rgba(255,255,255,0.5)" }}>End Secure Session</div>
          </div>
        </div>
      </div>

    </div>
  );
}