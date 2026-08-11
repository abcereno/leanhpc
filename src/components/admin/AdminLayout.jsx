import { Suspense, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/AuthContext";
import { useNotification } from "../../context/NotificationContext";
import { Toast, ToastContainer, Spinner } from "react-bootstrap";

// Components
import AppFooter from "../shared/layout/AppFooter";
import InquiryLoader from "../shared/ui/InquiryLoader";
import AdminNotificationWatcher from "./AdminNotificationWatcher";
import AdminSidebar from "./AdminSidebar";
import AdminNavbar from "./AdminNavbar"; 

export default function AdminLayout() {
  const { isAuthenticated, loadingAuth } = useAuth();
  const { notifications, removeNotification } = useNotification();

  // Controls the width of the sidebar and header
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  if (loadingAuth) return <div className="d-flex justify-content-center mt-5"><Spinner animation="border" /></div>;
  if (!isAuthenticated) return <Navigate to="/login" replace />;

  return (
    <>
      {/* Background Logic & Notifications */}
      <AdminNotificationWatcher />
      <ToastContainer position="top-end" className="p-3" style={{ zIndex: 9999, position: 'fixed' }}>
        {notifications.map((note) => (
          <Toast key={note.id} onClose={() => removeNotification(note.id)} bg={note.type === 'success' ? 'success' : 'info'} autohide delay={5000}>
            <Toast.Header><strong className="me-auto text-info">System Alert</strong></Toast.Header>
            <Toast.Body className={note.type === 'success' ? 'text-white' : ''}>{note.message}</Toast.Body>
          </Toast>
        ))}
      </ToastContainer>

      {/* === ENTERPRISE SHELL STARTS HERE === */}
      <div className="d-flex vh-100 overflow-hidden bg-light font-sans">
        
        {/* 1. SIDEBAR */}
        <AdminSidebar
          isSidebarOpen={isSidebarOpen}
          setIsSidebarOpen={setIsSidebarOpen}
        />
        
        {/* 2. RIGHT COLUMN (The style={{ minWidth: 0 }} locks the flexbox blowout!) */}
        <div className="d-flex flex-column flex-grow-1 overflow-hidden" style={{ minWidth: 0 }}>

          {/* Top Navbar */}
          <AdminNavbar 
            isSidebarOpen={isSidebarOpen} 
            setIsSidebarOpen={setIsSidebarOpen} 
          />

          {/* SCROLLABLE MAIN CONTENT (overflow-x-hidden traps wide tables/widgets) */}
          <main className="flex-grow-1 overflow-y-auto overflow-x-hidden">
            <Suspense fallback={
                <InquiryLoader />
            }>
              <Outlet />
            </Suspense>
          </main>
            <AppFooter />

        </div>
      </div>
    </>
  );
}