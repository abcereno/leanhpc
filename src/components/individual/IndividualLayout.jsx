import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext'; 
import { supabase } from "../../supabaseClient";
import { Spinner, Navbar, Offcanvas, Button, Ratio } from "react-bootstrap";
import { useClient } from "../../hooks/useClient";
import { useClientCreditFiles } from "../../hooks/useClientCreditFiles";
import { deriveServiceId } from "../../utils/services";

import { Joyride, STATUS } from 'react-joyride';

import Sidebar from './Sidebar'; 
import ProfileDashboard from './steps/ProfileDashboard';
import FreshStartClassroom from './sidebars/FreshStartClassroom';
import RequestHelpView from './sidebars/RequestHelpView'; 
import ServiceSelectionModal from './modals/ServiceSelectionModal';
import UniversalPaymentModal from './modals/UniversalPaymentModal';
import ServiceConfiguratorView from './sidebars/ServiceConfiguratorView';
import EbookView from './sidebars/EbookView'; 
import FinancingView from './sidebars/FinancingView';
import { useToast } from '../shared/ui/ToastNotifier';
import ProfileStep1 from './steps/ProfileStep1'; 
import ConsumerInvoices from './modals/ConsumerInvoices'; 
import VisionBoardView from './sidebars/VisionBoardView';

// 👇 NEW: Import the Bell Component 👇
import ClientNotificationBell from './ClientNotificationBell';
import SubscriptionLocked from '../shared/access/SubscriptionLocked';

import step1 from "../../assets/videos/step1.mp4";

export default function IndividualLayout() {
  const { signOut, user } = useAuth();
  const navigate = useNavigate();
  const { addToast } = useToast();

  const [activeTab, setActiveTab] = useState("dashboard");
  const [clientId, setClientId] = useState(null);
  const [initializing, setInitializing] = useState(true);
  const [creditRefresh, setCreditRefresh] = useState(0);
  
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedService, setSelectedService] = useState(null);

  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const handleCloseMobileMenu = () => setShowMobileMenu(false);
  const [isDesktopSidebarCollapsed, setIsDesktopSidebarCollapsed] = useState(false);
  
  const [requestingHelp, setRequestingHelp] = useState(false);
  const [helpRequested, setHelpRequested] = useState(false);

  const [runTour, setRunTour] = useState(false);
  const [tourKey, setTourKey] = useState(0); 

  useEffect(() => {
    const initClient = async () => {
      try {
        if (!user) return;
        
        let { data: clients } = await supabase.from("clients").select("id, is_paid").eq("auth_user_id", user.id).limit(1);
        let targetClient = clients?.[0];
        
        if (!targetClient) {
            const newClientPayload = {
                full_name: user.user_metadata?.full_name || user.email,
                email: user.email,
                dispute_method: 'inquiry deletion',
                service_id: deriveServiceId('inquiry deletion'),
                status: 'active',
                is_paid: false,
                auth_user_id: user.id
            };
            let { data: newClient, error: newClientErr } = await supabase.from("clients").insert(newClientPayload).select("id").single();
            // Defensive: sql/add_services.sql may not have been run yet — degrade
            // gracefully rather than leaving this client un-provisioned.
            if (newClientErr && /service_id/i.test(newClientErr.message || "")) {
                const { service_id: _omit, ...withoutServiceId } = newClientPayload;
                ({ data: newClient } = await supabase.from("clients").insert(withoutServiceId).select("id").single());
            }
            targetClient = newClient;
        }

        setClientId(targetClient.id);

        const hasSeenTour = localStorage.getItem(`hasSeenTour_${targetClient.id}`);
        if (!hasSeenTour) {
            setRunTour(true);
        }

      } catch (err) { 
        console.error(err); 
      } finally { 
        setInitializing(false); 
      }
    };
    
    initClient();
  }, [user]);

  useEffect(() => {
      if (clientId) {
          const hasRequested = localStorage.getItem(`helpRequested_${clientId}`);
          if (hasRequested === "true") {
              setHelpRequested(true);
          }
      }
  }, [clientId]);

  const { client, loading: loadingClient, refetch: refetchClient } = useClient(clientId);
  const { loading: loadingCredit, auditReport } = useClientCreditFiles(clientId, creditRefresh);

  const isActivated = client?.is_paid || false;

  const tourSteps = [
    {
      target: 'body', 
      placement: 'center',
      title: 'Welcome to your Fresh Start!',
      content: (
          <div style={{ width: '320px', maxWidth: '100%' }}>
              <Ratio aspectRatio="16x9" className="mb-3 rounded overflow-hidden shadow-sm bg-dark">
                  <video src={step1} controls autoPlay muted />
              </Ratio>
              <p className="text-muted small">Watch this quick video to learn how to navigate your new credit repair portal.</p>
          </div>
      ),
      disableBeacon: true,
    },
    {
      target: '.tour-tab-dashboard',
      title: 'The Dashboard',
      content: (
          <div style={{ width: '320px', maxWidth: '100%' }}>
              <p className="fw-bold mb-2">Your Command Center</p>
              <Ratio aspectRatio="16x9" className="mb-2 rounded overflow-hidden bg-dark">
                  <video src={step1} controls />
              </Ratio>
              <p className="text-muted small mb-0">This is where you will import your credit reports, review your audit, and generate your dispute letters.</p>
          </div>
      ),
      placement: 'right',
      disableBeacon: true,
      disableScrolling: true,
    },
    {
      target: '.tour-tab-fresh-start', 
      title: 'The Wealth Lab',
      content: (
          <div style={{ width: '320px', maxWidth: '100%' }}>
              <p className="fw-bold mb-2">Learn & Grow</p>
              <Ratio aspectRatio="16x9" className="mb-2 rounded overflow-hidden bg-dark">
                  <video src={step1} controls />
              </Ratio>
              <p className="text-muted small mb-0">Access the DIY Credit Bootcamp and learn the secrets of financial literacy here.</p>
          </div>
      ),
      placement: 'right',
      disableBeacon: true,
      disableScrolling: true,
    },
    {
      target: '.tour-tab-configurator', 
      title: 'Administrative Processing',
      content: (
          <div style={{ width: '320px', maxWidth: '100%' }}>
              <p className="fw-bold mb-2">Done-For-You Services</p>
              <Ratio aspectRatio="16x9" className="mb-2 rounded overflow-hidden bg-dark">
                  <video src={step1} controls />
              </Ratio>
              <p className="text-muted small mb-0">Don't want to do it yourself? Click here to request Done-For-You processing support from our expert team.</p>
          </div>
      ),
      placement: 'right',
      disableBeacon: true,
      disableScrolling: true,
    }
  ];

  const handleTourCallback = (data) => {
      const { status } = data;
      const finishedStatuses = [STATUS.FINISHED, STATUS.SKIPPED];

      if (finishedStatuses.includes(status)) {
          setRunTour(false);
          localStorage.setItem(`hasSeenTour_${clientId}`, "true");
      }
  };

  const handleRequestAdminHelp = async () => {
    setRequestingHelp(true);
    try {
        const { error } = await supabase.from('notifications').insert({
            type: 'admin_help_request',
            client_id: clientId,
            message: `Client ${client?.full_name || 'Unknown'} (${user?.email}) requested admin assistance from the Preview Banner to activate their account.`,
            status: 'unread',
            created_at: new Date().toISOString()
        });
        if (error) throw error;
        
        const webhookUrl = "https://services.leadconnectorhq.com/hooks/4tb8QYdUxvRnyNgCIUTD/webhook-trigger/36c7c9da-355a-46ad-826b-2b378a560212";
        await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: client?.email, fullName: client?.full_name, phone: client?.phone || "", source: "preview_activation_request", clientId: clientId })
        });
        
        addToast({ title: "Request Sent", message: "An admin has been notified and will contact you shortly to activate your portal.", variant: "success", icon: "bi-check-circle-fill" });

        setHelpRequested(true);
        localStorage.setItem(`helpRequested_${clientId}`, "true");
        setIsBannerMinimized(true);

    } catch (err) {
        console.error("Error requesting help:", err);
        addToast({ title: "Failed to Send Request", message: "Please contact support directly.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
        setRequestingHelp(false);
    }
  };

  useEffect(() => {
    const handleStripeRedirect = async () => {
        if (!clientId || !client) return;

        const query = new URLSearchParams(window.location.search);
        const isSuccess = query.get("success");
        const type = query.get("type"); 
        const invoiceId = query.get("invoice_id");

        if (isSuccess) {
            if (invoiceId && invoiceId.startsWith('DIRECT_')) {
                const serviceType = invoiceId.split('_')[1]; 
                if (serviceType === 'vault') {
                    await supabase.from('clients').update({ has_education_vault: true }).eq('id', clientId);
                    await refetchClient(); 
                    addToast({ title: "Payment Successful", message: "Your Classroom is now unlocked.", variant: "success", icon: "bi-unlock-fill" });
                }
            }

            if (type === 'ebook') {
                addToast({ title: "E-Book Unlocked", message: "You can now read it in your Digital Library.", variant: "success", icon: "bi-book-fill" });
            }

            if (type === 'custom_service') {
                await supabase.from('clients').update({ is_paid: true }).eq('id', clientId);
                await refetchClient();
                addToast({ title: "Account Activated", message: "Welcome to the luxury experience.", variant: "success", icon: "bi-gem" });
            }
            
            try {
                const webhookUrl = "https://services.leadconnectorhq.com/hooks/4tb8QYdUxvRnyNgCIUTD/webhook-trigger/36c7c9da-355a-46ad-826b-2b378a560212";
                await fetch(webhookUrl, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ 
                        email: client?.email, 
                        fullName: client?.full_name, 
                        phone: client?.phone || "", 
                        source: "client_payment_success", 
                        paymentType: type || "unknown",
                        invoiceId: invoiceId || "none",
                        clientId: clientId 
                    })
                });
            } catch (webhookErr) { 
                console.error("❌ Failed to send HighLevel webhook:", webhookErr); 
            }
            
            window.history.replaceState(null, '', window.location.pathname);
        }
    };

    handleStripeRedirect();
  }, [clientId, client, refetchClient]);

  const hasVault = client?.has_education_vault || false; 

  const tabs = [
    { id: "profile", label: "Profile", icon: "bi bi-person", category: "Account", tourClass: "tour-tab-profile" },
    { id: "dashboard", label: "My Disputes", icon: "bi bi-shield-check", category: "Dashboard", tourClass: "tour-tab-dashboard" },
    
    { id: "vision-board", label: "Vision Board", icon: "bi bi-image", category: "Wealth Lab", tourClass: "tour-tab-vision" },
    { id: "fresh-start", label: "Course", icon: "bi bi-play-circle", category: "Wealth Lab", tourClass: "tour-tab-fresh-start" },
    { id: "ebook", label: "E-Books", icon: "bi bi-book", category: "Wealth Lab", tourClass: "tour-tab-ebook" },
    
    { id: "financing", label: "Apply for Financing", icon: "bi bi-cash-coin", category: "Funding", tourClass: "tour-tab-financing" },
    
    { id: "configurator", label: "Processing Options", icon: "bi bi-gear", category: "Services", tourClass: "tour-tab-configurator" },
    { id: "billing", label: "Billing", icon: "bi bi-receipt", category: "Services", tourClass: "tour-tab-billing" },
    
    { id: "help", label: "Support", icon: "bi bi-headset", category: "Support", tourClass: "tour-tab-help" },
  ];

  const handleTabChange = (tabId) => {
    if (tabId === "fresh-start" && !hasVault) {
        setSelectedService('vault');
        setShowPaymentModal(true);
        return;
    }

    setActiveTab(tabId);
    setShowMobileMenu(false); 
  };

  const renderContent = () => {
    switch (activeTab) {
      case "profile": return <ProfileStep1 client={client} clientId={clientId} onSave={refetchClient} />;
      case "configurator": return <ServiceConfiguratorView client={client} auditReport={auditReport} />;
      case "billing": return <ConsumerInvoices clientId={clientId} />;
      case "fresh-start": return <FreshStartClassroom />;
      case "ebook": return <EbookView client={client} />;
      case "vision-board": return <VisionBoardView clientId={clientId} onNextStep={() => setActiveTab('dashboard')} />;
      case "financing": return <FinancingView client={client} />;
      case "help": return <RequestHelpView user={user} />;
      case "dashboard":
      default:
        return <ProfileDashboard 
                 clientId={clientId} 
                 client={client} 
                 auditReport={auditReport}
                 user={user} 
                 refetchClient={refetchClient}
                 onCreditRefresh={() => setCreditRefresh(prev => prev + 1)}
                 onRequestService={() => setShowServiceModal(true)} 
                 isPreviewMode={!isActivated} 
               />;
    }
  };

  const restartTour = () => {
      setTourKey(prev => prev + 1);
      setRunTour(true);
  };

  if (initializing || !clientId || loadingClient || loadingCredit) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center vh-100 bg-transparent">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3 text-muted">Loading your secure data...</p>
      </div>
    );
  }

  // Full lock: replaces the old "Preview Mode" banner (which let unpaid
  // clients browse everything) with a hard block. Reuses the existing
  // Request Admin Help flow (notification + webhook, defined above) instead
  // of duplicating it, so there's still a path to activation from here.
  // "Upload Payment Receipt" reuses UniversalPaymentModal (already handles
  // Zelle screenshot upload -> payment_verifications) with the
  // 'account_activation' service type, so the client can self-serve a
  // receipt instead of only being able to ask an admin to do it manually.
  if (!isActivated) {
    return (
      <>
        <SubscriptionLocked
          title="Account Not Activated"
          message="Your portal access is currently on hold. Upload a payment receipt or request admin help to get your account activated and start your dispute process."
          actionLabel="Upload Payment Receipt"
          onAction={() => {
            setSelectedService('account_activation');
            setShowPaymentModal(true);
          }}
          secondaryActionLabel={helpRequested ? "Admin Notified" : "Request Admin Help"}
          onSecondaryAction={helpRequested ? undefined : handleRequestAdminHelp}
          onLogout={() => signOut().then(() => navigate('/login'))}
        />
        <UniversalPaymentModal
          show={showPaymentModal}
          onHide={() => setShowPaymentModal(false)}
          serviceType={selectedService}
          clientId={clientId}
        />
      </>
    );
  }

  return (
    <div className="d-flex bg-transparent position-relative" style={{ minHeight: "100vh" }}> 
      
      <Joyride
          key={tourKey}
          steps={tourSteps}
          run={runTour}
          continuous={true}
          showSkipButton={true}
          showProgress={true}
          callback={handleTourCallback}
          floaterProps={{ disableAnimation: true }}
          styles={{
              options: {
                  primaryColor: '#0d6efd',
                  zIndex: 10000,
              },
              tooltip: {
                  borderRadius: '8px',
                  padding: '20px'
              },
              buttonNext: {
                  fontWeight: 'bold',
                  borderRadius: '6px'
              }
          }}
      />

      <div 
        className="d-none d-lg-block bg-transparent" 
        style={{ 
            width: isDesktopSidebarCollapsed ? "0px" : "280px", 
            position: "fixed", 
            top: 0, 
            bottom: 0, 
            zIndex: 1000,
            overflow: "hidden", 
            transition: "width 0.3s ease" 
        }}
      >
        <div style={{ width: "280px", height: "100%" }}>
            <Sidebar 
                menuItems={tabs} 
                activeTab={activeTab} 
                onTabChange={handleTabChange} 
                onLogout={() => signOut().then(() => navigate('/login'))} 
                hasVault={hasVault} 
                isPreviewMode={!isActivated}
                isDesktop={true} 
            />
        </div>
      </div>

      <Offcanvas show={showMobileMenu} onHide={handleCloseMobileMenu} className="bg-dark border-0" style={{ width: "280px" }}>
        <Sidebar 
            menuItems={tabs} 
            activeTab={activeTab} 
            onTabChange={handleTabChange} 
            onLogout={() => signOut().then(() => navigate('/login'))} 
            hasVault={hasVault}
            isPreviewMode={!isActivated}
            isDesktop={false}
        />
      </Offcanvas>

      <div className="flex-grow-1 d-flex flex-column bg-transparent" style={{ marginLeft: 0 }}>
        {/* MOBILE TOP NAVBAR */}
        <Navbar bg="transparent" expand="lg" className="d-lg-none px-3 py-2 border-bottom sticky-top bg-white">
            <Button variant="outline-primary" className="p-1 me-2" onClick={() => setShowMobileMenu(true)}>
                <i className="bi bi-list fs-3"></i>
            </Button>
            <Navbar.Brand className="fw-bold text-primary m-0">CLIENT PORTAL</Navbar.Brand>
            
            <div className="ms-auto d-flex align-items-center">
                {/* 👇 NOTIFICATION BELL MOBILE 👇 */}
                <ClientNotificationBell />
                <Button variant="link" className="p-0 ms-3 text-secondary" onClick={restartTour} title="Replay Tour">
                    <i className="bi bi-question-circle fs-4"></i>
                </Button>
            </div>
        </Navbar>

        <main
            className="flex-grow-1 main-content-area p-3 p-md-4 bg-transparent position-relative"
            style={{
              paddingBottom: "20px",
              transition: "padding-bottom 0.3s ease",
              '--sidebar-margin': isDesktopSidebarCollapsed ? '0px' : '280px',
            }}
        >
          {/* DESKTOP TOP HEADER */}
          <div className="d-none d-lg-flex justify-content-between align-items-center mb-4">
             <Button 
                variant="dark" 
                className="d-flex align-items-center justify-content-center shadow-sm"
                onClick={() => setIsDesktopSidebarCollapsed(!isDesktopSidebarCollapsed)}
                style={{ 
                    width: '42px', height: '42px', borderRadius: '8px',
                    backgroundColor: '#1e2337', border: '1px solid #2d334a', color: '#adb5bd'
                }}
             >
                <i className={`bi ${isDesktopSidebarCollapsed ? 'bi-list' : 'bi-layout-sidebar-inset'} fs-5`}></i>
             </Button>

             <div className="d-flex align-items-center">
                {/* 👇 NOTIFICATION BELL DESKTOP 👇 */}
                <ClientNotificationBell />
                <Button variant="outline-secondary" size="sm" onClick={restartTour} className="fw-bold ms-3">
                    <i className="bi bi-play-circle me-2"></i> Replay Tour
                </Button>
             </div>
          </div>

          {renderContent()}
        </main>
      </div>

      <ServiceSelectionModal
        show={showServiceModal} 
        onHide={() => setShowServiceModal(false)}
        onSelectService={(type) => {
            setSelectedService(type);
            setShowServiceModal(false);
            setShowPaymentModal(true);
        }}
      />

      <UniversalPaymentModal 
        show={showPaymentModal}
        onHide={() => setShowPaymentModal(false)}
        serviceType={selectedService}
        clientId={clientId}
      />
    </div>
  );
}