import React, { useState, useEffect } from 'react';
import { Row, Col, Card, Button, Badge, Modal, Spinner } from 'react-bootstrap';
import { supabase } from "../../../supabaseClient";
import { useToast } from "../../shared/ui/ToastNotifier";

// ==========================================
// 📚 IMAGE IMPORTS
// ==========================================
import imgApple from '../../../assets/ebooks/ninja-apple.png';
import imgDiscover from '../../../assets/ebooks/ninja-Discover.png';
import imgHomebuyer from '../../../assets/ebooks/ninja-homebuyer.png';
import imgInquiry from '../../../assets/ebooks/ninja-inquiry.png';
import imgManifesto from '../../../assets/ebooks/ninja-Manifesto.png';
import imgNFCU from '../../../assets/ebooks/ninja-NFCU.png';
import imgPlanner from '../../../assets/ebooks/ninja-planner.png';
import imgRepossession from '../../../assets/ebooks/ninja-repossession.png';
import imgStudent from '../../../assets/ebooks/ninja-student.png';
import img10kBlueprint from '../../../assets/ebooks/updated - 10K Blueprint.png';
import imgBankruptcy from '../../../assets/ebooks/updated - bankruptcy.png';
import imgBranding from '../../../assets/ebooks/updated - branding.png';
import imgBusinessCreditGuide from '../../../assets/ebooks/updated - Business Credit Guide.png'; 
import imgBusinessRocket from '../../../assets/ebooks/updated - business rocket.png';
import imgBusiness from '../../../assets/ebooks/updated - business.png';
import imgQuickFunding from '../../../assets/ebooks/updated - quick funding.png';

const IMAGE_MAP = {
  1: imgBusiness,               
  2: imgPlanner,                
  3: imgBusinessCreditGuide,    
  4: imgNFCU,                   
  5: imgBranding,               
  6: imgApple,                  
  7: imgQuickFunding,           
  8: imgHomebuyer,              
  9: imgStudent,                
  10: img10kBlueprint,          
  11: imgBankruptcy,            
  12: imgManifesto,             
  13: imgBusinessRocket,        
  14: imgInquiry,               
  15: imgDiscover,              
  16: imgRepossession           
};

export default function EbookView({ client }) {
  const { addToast } = useToast();
  const [ebooks, setEbooks] = useState([]);
  const [unlockedEbooks, setUnlockedEbooks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [checkoutLoadingId, setCheckoutLoadingId] = useState(null);

  const [showPdfModal, setShowPdfModal] = useState(false);
  const [activeBook, setActiveBook] = useState(null);

  useEffect(() => {
    const fetchLibraryData = async () => {
      setLoading(true);
      try {
        const { data: catalogData, error: catalogErr } = await supabase
          .from('ebooks')
          .select('*')
          .eq('is_active', true)
          .order('id', { ascending: true });
        
        if (catalogErr) throw catalogErr;
        setEbooks(catalogData || []);

        if (client?.id) {
          const { data: purchaseData, error: purchaseErr } = await supabase
            .from('client_ebook_purchases')
            .select('ebook_id')
            .eq('client_id', client.id);

          if (purchaseErr) throw purchaseErr;
          setUnlockedEbooks(purchaseData.map(p => p.ebook_id));
        }
      } catch (error) {
        console.error("Error loading E-books:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchLibraryData();

    // 👇 NEW: Realtime Listener! 👇
    // This listens for the exact moment the Edge Function inserts the purchase
    let channel;
    if (client?.id) {
      channel = supabase
        .channel('realtime-ebook-purchases')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'client_ebook_purchases',
            filter: `client_id=eq.${client.id}`,
          },
          (payload) => {
            console.log("🎉 New book unlocked via Webhook!", payload);
            // Instantly add the new ebook_id to state so the UI unlocks
            setUnlockedEbooks((prev) => [...prev, payload.new.ebook_id]);
          }
        )
        .subscribe();
    }

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [client]);

const handleBookAction = async (book) => {
    const isUnlocked = unlockedEbooks.includes(book.id);

    if (isUnlocked) {
      setActiveBook(book);
      setShowPdfModal(true);
      return;
    }

    setCheckoutLoadingId(book.id);
    
    try {
      // 👇 SECURE PAYLOAD: Notice how there is NO PRICE here!
      const payload = {
        type: 'ebook',
        clientId: client?.id,
        clientEmail: client?.email,
        returnUrl: window.location.href.split('?')[0],
        metadata: {
          ebookId: String(book.id)
        }
      };

      const { data, error } = await supabase.functions.invoke('create-stripe-checkout', {
        body: payload
      });

      if (error) throw error;

      if (data?.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        throw new Error(data?.error || "Failed to generate checkout link.");
      }
    } catch (err) {
      console.error("Checkout error:", err);
      addToast({ title: "Checkout Failed", message: "Please try again.", variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setCheckoutLoadingId(null);
    }
  };

  if (loading) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center py-5">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3 text-muted">Loading your digital library...</p>
      </div>
    );
  }

  return (
    <div className="animate-fade-in pb-5">
      <div className="mb-4 border-bottom border-secondary border-opacity-25 pb-3">
        <h3 className="fw-bold text-primary mb-1">
          <i className="bi bi-journal-richtext me-2"></i> 
          Digital Library
        </h3>
        <p className="text-muted mb-0">
          Exclusive guides, blueprints, and templates to master your financial journey.
        </p>
      </div>

      <Row className="g-4">
        {ebooks.map((book) => {
          const isUnlocked = unlockedEbooks.includes(book.id);
          const isCheckingOut = checkoutLoadingId === book.id;
          const localImage = IMAGE_MAP[book.id] || ""; 

          return (
            <Col key={book.id} xs={12} sm={6} lg={4} xl={3}>
              <Card className="h-100 shadow-sm border-secondary bg-dark text-white hover-lift overflow-hidden d-flex flex-column">
                <div className="position-relative border-bottom border-secondary border-opacity-50 bg-black flex-shrink-0" style={{ height: '220px', overflow: 'hidden' }}>
                  <Badge 
                    bg={isUnlocked ? "success" : "dark"} 
                    className={`position-absolute top-0 end-0 m-2 shadow-sm border ${isUnlocked ? 'border-success' : 'border-secondary'} text-light px-2 py-1 fs-6`} 
                    style={{ zIndex: 10 }}
                  >
                    {isUnlocked ? <><i className="bi bi-unlock-fill me-1"></i> Unlocked</> : `$${book.price}`}
                  </Badge>
                  
                  <Card.Img 
                    variant="top" 
                    src={localImage} 
                    alt={book.title}
                    style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: isUnlocked ? '1' : '0.85', padding: '10px' }} 
                  />
                </div>

                <Card.Body className="d-flex flex-column p-4">
                  <Card.Title className="fw-bold fs-5 mb-2 lh-sm text-light">
                    {book.title}
                  </Card.Title>
                  
                  <Card.Text className="text-muted small flex-grow-1 lh-base mb-4">
                    {book.description}
                  </Card.Text>
                  
                  <Button 
                    variant={isUnlocked ? "success" : "outline-info"} 
                    className="w-100 mt-auto fw-bold d-flex align-items-center justify-content-center"
                    disabled={isCheckingOut && !isUnlocked}
                    onClick={() => handleBookAction(book)}
                  >
                    {isUnlocked ? (
                      <><i className="bi bi-book-half me-2"></i> Read Now</>
                    ) : isCheckingOut ? (
                      <><Spinner as="span" animation="border" size="sm" role="status" aria-hidden="true" className="me-2" /> Connecting...</>
                    ) : (
                      <><i className="bi bi-lock-fill me-2"></i> Unlock for ${book.price}</>
                    )}
                  </Button>
                </Card.Body>
              </Card>
            </Col>
          );
        })}
      </Row>

      <Modal 
        show={showPdfModal} 
        onHide={() => setShowPdfModal(false)} 
        size="xl" 
        centered
        contentClassName="bg-dark text-white border-secondary"
      >
        <Modal.Header closeButton closeVariant="white" className="border-bottom border-secondary border-opacity-50">
          <Modal.Title className="fw-bold">
            <i className="bi bi-book-half me-2 text-primary"></i> 
            {activeBook?.title}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body className="p-0" style={{ height: '75vh' }}>
          {activeBook?.pdf_url ? (
            <iframe 
              src={`${activeBook.pdf_url}#toolbar=0&navpanes=0`} 
              width="100%" 
              height="100%" 
              style={{ border: 'none' }}
              title={activeBook.title}
            />
          ) : (
            <div className="d-flex align-items-center justify-content-center h-100 text-muted">
              <p>Document URL is missing. Please contact support.</p>
            </div>
          )}
        </Modal.Body>
      </Modal>
    </div>
  );
}