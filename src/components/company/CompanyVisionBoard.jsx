import React, { useState, useEffect } from "react";
import { Row, Col, Spinner, Button, Modal, Form } from "react-bootstrap";
import { supabase } from "../../supabaseClient";
import { useToast } from "../shared/ui/ToastNotifier";

// Placeholder images for the static aesthetic parts of the board
const AESTHETIC_IMAGES = {
    skyLimit: "https://images.unsplash.com/photo-1451187580459-43490279c0fa?q=80&w=800&auto=format&fit=crop", // Space/Sky portal
    pushingLimits: "https://images.unsplash.com/photo-1552581234-26160f608093?q=80&w=800&auto=format&fit=crop", // Business man
    brain: "https://images.unsplash.com/photo-1559757175-5700dde675bc?q=80&w=800&auto=format&fit=crop", // Neon brain/city
    money: "https://images.unsplash.com/photo-1580519542036-ed47f3e42214?q=80&w=800&auto=format&fit=crop", // $100 bills
};

const DEFAULT_VISION_IMAGES = {
    slot1: "",
    slot2: "",
    slot3: "",
    slot4: ""
};

const extractStoragePath = (publicUrl) => {
    if (!publicUrl) return null;
    if (publicUrl.includes('/uploads/')) {
        return publicUrl.split('/uploads/')[1].split('?')[0];
    }
    return null;
};

export default function CompanyVisionBoard({ clientId }) {
  const { addToast } = useToast();
  const [boardImages, setBoardImages] = useState(DEFAULT_VISION_IMAGES);
  const [loading, setLoading] = useState(true);
  
  const [uploadModal, setUploadModal] = useState({ show: false, slot: null, file: null });
  const [savingUpload, setSavingUpload] = useState(false);

  const [todos, setTodos] = useState([
      { id: 1, text: "Submit all client intake forms", is_completed: true },
      { id: 2, text: "Approve pending invoices", is_completed: true },
      { id: 3, text: "Review completed deletions", is_completed: false },
      { id: 4, text: "Follow up with 5 leads", is_completed: false }
  ]);

  const [coreFocus, setCoreFocus] = useState([
      { id: 1, text: "Client Volume Goal This Month: ___", is_completed: true },
      { id: 2, text: "Current Tier: Elite", is_completed: true },
      { id: 3, text: "Next Tier Milestone: 21+ more clients to reach Inner Circle", is_completed: false }
  ]);

  const fetchDashboardData = async () => {
    if (!clientId) {
        setLoading(false);
        return;
    }

    try {
      const { data: imgData, error: imgError } = await supabase
        .from('vision_board')
        .select('*')
        .eq('client_id', clientId); 
      
      if (imgError) throw imgError;

      let fetchedImages = { ...DEFAULT_VISION_IMAGES };
      
      imgData.forEach(dbRow => {
        if (fetchedImages[dbRow.category] !== undefined && dbRow.image_url) {
            fetchedImages[dbRow.category] = dbRow.image_url;
        }
      });
      setBoardImages(fetchedImages);

    } catch (err) {
      console.error("Error fetching dashboard data:", err);
    } finally {
      setLoading(false); 
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, [clientId]);

  const openUploadModal = (slotKey) => {
      setUploadModal({ show: true, slot: slotKey, file: null });
  };

  const closeUploadModal = () => {
      setUploadModal({ show: false, slot: null, file: null });
  };

  const handleSaveVisionSlot = async (e) => {
    e.preventDefault();
    if (!clientId) return addToast({ title: "System Error", message: "ID is missing. Please refresh.", variant: "danger", icon: "bi-exclamation-triangle-fill" });

    const { slot, file } = uploadModal;
    if (!file) return;

    setSavingUpload(true);

    try {
      const { data: existingDocs } = await supabase
          .from('vision_board')
          .select('id, image_url')
          .eq('client_id', clientId)
          .eq('category', slot)
          .limit(1);

      const existingDoc = existingDocs?.[0];
      let finalUrl = existingDoc ? existingDoc.image_url : "";

      const fileExt = file.name.split('.').pop();
      const storagePath = `${clientId}/vision_${slot}_${Date.now()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage.from('uploads').upload(storagePath, file);
      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(storagePath);
      finalUrl = `${publicUrl}?t=${Date.now()}`;

      if (existingDoc) {
          let oldPath = extractStoragePath(existingDoc.image_url);
          if (oldPath) await supabase.storage.from('uploads').remove([oldPath]).catch(err => console.log("Cleanup error:", err));
          await supabase.from('vision_board').update({ image_url: finalUrl }).eq('id', existingDoc.id);
      } else {
          await supabase.from('vision_board').insert({ client_id: clientId, category: slot, image_url: finalUrl, title: slot });
      }

      await fetchDashboardData();
      closeUploadModal();
      addToast({ title: "Vision Board Updated", message: "Your slot was saved.", variant: "success", icon: "bi-image-fill" });
    } catch (err) {
      console.error("Upload error details:", err);
      addToast({ title: "Update Failed", message: err.message, variant: "danger", icon: "bi-exclamation-triangle-fill" });
    } finally {
      setSavingUpload(false);
    }
  };

  const toggleTodo = (id) => {
      setTodos(todos.map(t => t.id === id ? { ...t, is_completed: !t.is_completed } : t));
  };
  
  const toggleFocus = (id) => {
      setCoreFocus(coreFocus.map(t => t.id === id ? { ...t, is_completed: !t.is_completed } : t));
  };

  if (loading) {
      return <div className="d-flex justify-content-center align-items-center py-5"><Spinner animation="border" style={{color: '#00D0FF'}} /></div>;
  }

  return (
    <div className="elite-board-wrapper animate-fade-in" style={{ '--vision-money-bg': `url(${AESTHETIC_IMAGES.money})` }}>
      <Row className="g-3">
        
        {/* ========================================= */}
        {/* COLUMN 1: LEFT                            */}
        {/* ========================================= */}
        <Col lg={3} className="d-flex flex-column gap-3">
            
            {/* Top Left Poster */}
            <div className="panel-dark panel-neon-glow text-center">
                <h2 className="fw-bold text-white mb-0" style={{fontSize: '2.5rem', lineHeight: '1.1'}}>THE SKY IS</h2>
                <h2 className="fw-bold text-white mb-3" style={{fontSize: '2.5rem', lineHeight: '1.1'}}>THE LIMIT.</h2>
                
                <div className="hero-img-box">
                    <img src={AESTHETIC_IMAGES.skyLimit} alt="Sky Limit" />
                    <div className="hero-gradient"></div>
                </div>

                <p className="small text-muted mb-0">You push beyond limits.</p>
                <p className="small text-muted mb-0">You take action, others delay.</p>
                <p className="small text-muted mb-0">You strive for greater success.</p>
                <p className="small text-white mt-2 fw-bold">Your next goal: Inner Circle.</p>
            </div>

            {/* Affirmations List */}
            <div className="panel-dark">
                <h6 className="fw-bold text-neon-blue text-center mb-3"><i className="bi bi-suit-heart me-2"></i> ELITE AFFIRMATIONS</h6>
                <ul className="small text-muted ps-3 mb-4" style={{lineHeight: '1.6'}}>
                    <li>I act with decisiveness to drive progress.</li>
                    <li>I'm consistent. Relentless. Committed.</li>
                    <li>I set new benchmarks for my team.</li>
                    <li>Each win motivates me to achieve even more.</li>
                </ul>
                <p className="small text-muted mb-4 fst-italic">The choices you make today shape the success you'll achieve tomorrow.</p>
                <div className="d-flex align-items-center text-white small">
                    <div className="bg-secondary rounded-circle text-center fw-bold me-2" style={{width: '20px', height: '20px', lineHeight: '20px'}}>T</div>
                    TOKEN SOCIETY
                </div>
            </div>

            {/* Core Focus & Growth Moves */}
            <div className="panel-dark p-0 bg-transparent border-0 d-flex gap-2 h-100">
                <div className="panel-dark flex-grow-1" style={{padding: '15px'}}>
                    <h6 className="fw-bold text-neon-blue mb-3"><i className="bi bi-bullseye me-2"></i> CORE FOCUS:</h6>
                    {coreFocus.map(item => (
                        <div key={item.id} className={`custom-check ${item.is_completed ? 'completed' : ''}`} onClick={() => toggleFocus(item.id)}>
                            <i className={`bi ${item.is_completed ? 'bi-check-square-fill' : 'bi-square'}`}></i>
                            <span>{item.text}</span>
                        </div>
                    ))}

                    <h6 className="fw-bold text-neon-blue mb-2 mt-4"><i className="bi bi-lightbulb me-2"></i> REMINDERS:</h6>
                    <div className="small text-muted">
                        <div className="mb-2"><i className="bi bi-check text-neon-blue me-1"></i> Track growth weekly—not just revenue, but results.</div>
                        <div className="mb-2"><i className="bi bi-check text-neon-blue me-1"></i> Remove bottlenecks. Multiply approvals. Scale smart.</div>
                        <div className="mb-2"><i className="bi bi-check text-neon-blue me-1"></i> Consistency is the new currency.</div>
                    </div>
                </div>

                <div className="sticky-paper flex-shrink-0 money-bg" style={{width: '140px', padding: '25px 15px'}}>
                    <div className="pin"></div>
                    <div className="text-handwritten fw-bold fs-4 mb-2 border-bottom border-info pb-1">Growth Moves</div>
                    <ul className="ps-3 mb-0 small text-handwritten fs-5" style={{lineHeight: '1.2'}}>
                        <li className="mb-1">Refer 1 new biz owner</li>
                        <li className="mb-1">Share your link</li>
                        <li className="mb-1">Review updates</li>
                        <li>Track & renew tokens</li>
                    </ul>
                </div>
            </div>

        </Col>

        {/* ========================================= */}
        {/* COLUMN 2: CENTER                          */}
        {/* ========================================= */}
        <Col lg={6} className="d-flex flex-column gap-3">
            
            {/* Top Dashboard Header */}
            <div className="panel-dark p-3">
                <Row className="g-2 mb-2">
                    <Col xs={3}>
                        <div className="stat-box">
                            <div className="stat-box-label">YOUR TIER</div>
                            <div className="circle-badge">ELITE</div>
                        </div>
                    </Col>
                    <Col xs={6}>
                        <div className="stat-box py-4 bg-black">
                            <div className="circle-badge neon" style={{width: '100px', height: '100px', fontSize: '1.8rem'}}>ELITE</div>
                        </div>
                    </Col>
                    <Col xs={3}>
                        <div className="stat-box">
                            <div className="stat-box-label">CLIENTS THIS MONTH</div>
                            <div className="stat-box-val text-neon-blue">22</div>
                        </div>
                    </Col>
                </Row>
                
                <Row className="g-2 mb-3">
                    <Col xs={4}>
                        <div className="stat-box">
                            <div className="stat-box-label">TOTAL EARNED</div>
                            <div className="stat-box-val text-start text-success">$</div>
                        </div>
                    </Col>
                    <Col xs={4}>
                        <div className="stat-box" style={{background: '#111'}}>
                            <div className="small text-muted mb-1">YOU'RE <strong className="text-white">CLIENTS</strong> AWAY FROM</div>
                            <div className="text-neon-blue fw-bold">INNER CIRCLE</div>
                        </div>
                    </Col>
                    <Col xs={4}>
                        <div className="stat-box">
                            <div className="stat-box-label">NEXT TIER PROGRESS</div>
                            <div className="circle-badge neon mt-2 mb-2" style={{width: '60px', height: '60px', fontSize: '0.8rem'}}>INNER<br/>CIRCLE</div>
                            <div className="small text-neon-blue fw-bold">21 CLIENTS AWAY</div>
                            <div className="stat-box-label mt-1" style={{fontSize: '0.6rem'}}>FROM INNER CIRCLE</div>
                        </div>
                    </Col>
                </Row>

                <Row className="g-2">
                    <Col><button className="action-btn w-100">SUBMIT CLIENT</button></Col>
                    <Col><button className="action-btn w-100">VIEW TRACKER</button></Col>
                    <Col><button className="action-btn w-100">ADD TOKENS</button></Col>
                </Row>
            </div>

            {/* Vision Board 2x2 */}
            <div className="panel-dark">
                <h4 className="fw-bold text-neon-blue text-center mb-3"><i className="bi bi-image me-2"></i> VISION BOARD</h4>
                <div className="vision-grid">
                    {[1, 2, 3, 4].map(num => {
                        const slot = `slot${num}`;
                        return (
                            <div key={slot} className="vision-slot" onClick={() => openUploadModal(slot)}>
                                {boardImages[slot] && <img src={boardImages[slot]} alt={`Vision ${num}`} />}
                                <div className="upload-overlay"><i className="bi bi-camera-fill"></i></div>
                                {!boardImages[slot] && <div className="vision-slot-text"><i className="bi bi-image fs-3 d-block mb-1"></i> ADD IMAGE</div>}
                                {boardImages[slot] && <div className="vision-slot-label"><span>GOAL {num}</span><i className="bi bi-suit-heart-fill text-neon-blue"></i></div>}
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Bottom Images Split */}
            <div className="d-flex gap-3 h-100">
                <div className="panel-dark p-0 flex-grow-1 overflow-hidden" style={{position: 'relative'}}>
                    <img src={AESTHETIC_IMAGES.pushingLimits} alt="Push Limits" style={{width: '100%', height: '100%', objectFit: 'cover', opacity: 0.6}} />
                    <div style={{position: 'absolute', right: '20px', top: '20px', textAlign: 'right'}}>
                        <h3 className="fw-bold text-white mb-0" style={{lineHeight: 1}}>PUSHING</h3>
                        <h3 className="fw-bold text-white mb-0" style={{lineHeight: 1}}>THROUGH</h3>
                        <h3 className="fw-bold text-neon-blue" style={{lineHeight: 1}}>LIMITS</h3>
                    </div>
                </div>
            </div>

            <div className="panel-dark p-0 overflow-hidden text-center" style={{height: '250px', position: 'relative'}}>
                <img src={AESTHETIC_IMAGES.brain} alt="Elite Mindset" style={{width: '100%', height: '100%', objectFit: 'cover', opacity: 0.5}} />
                <h1 className="fw-bold position-absolute w-100 text-neon-blue" style={{bottom: '10px', fontSize: '4rem', textShadow: '0 5px 15px rgba(0,208,255,0.6)', letterSpacing: '5px'}}>ELITE</h1>
            </div>

        </Col>

        {/* ========================================= */}
        {/* COLUMN 3: RIGHT                           */}
        {/* ========================================= */}
        <Col lg={3} className="d-flex flex-column gap-3">
            
            {/* Roadmap */}
            <div className="panel-dark text-center">
                <h5 className="fw-bold text-neon-blue mb-4"><i className="bi bi-geo-alt me-2"></i> ROADMAP</h5>
                
                <div className="roadmap-container position-relative mb-4">
                    <div className="roadmap-node neon mx-auto mb-4" style={{width: '80px', height: '80px', fontSize: '0.9rem'}}>INNER<br/>CIRCLE</div>
                    <div className="d-flex justify-content-between px-3 position-relative">
                        <div className="roadmap-node text-white border-secondary">ELITE</div>
                        <div className="roadmap-node text-muted border-secondary" style={{fontSize: '0.55rem'}}>SYNDICATE</div>
                        <div className="position-absolute w-100 text-center text-muted" style={{top: '20px', left: 0, fontSize: '0.6rem'}}>+21 MORE<br/>TO INNER CIRCLE</div>
                    </div>
                </div>

                <div className="small text-muted mb-2">14 CLIENTS</div>
                <h5 className="fw-bold text-white">21+ <span className="text-muted">TO ENTER</span></h5>
                <h5 className="fw-bold text-neon-blue">THE INNER CIRCLE</h5>
            </div>

            {/* Affirmations Sticky */}
            <div className="sticky-paper money-bg">
                <div className="pin"></div>
                <h6 className="text-white fw-bold mb-3 mt-2 tracking-wide">AFFIRMATIONS</h6>
                <div className="small text-white fw-bold" style={{fontFamily: 'Courier New, monospace', lineHeight: '1.5'}}>
                    <p className="mb-3">1. I WEAR SUCCESS IN MY EVERYDAY.</p>
                    <p className="mb-3">2. MY RESULTS ARE MAGNETS FOR ABUNDANCE.</p>
                    <p className="mb-0">3. I CHOOSE IMPACT AND GENERATIONAL WEALTH OVER EASY AND TEMPORARY.</p>
                </div>
            </div>

            {/* Tradelines Banner */}
            <div className="panel-dark text-center py-4">
                <h5 className="fw-bold text-white mb-0">TRADLINES</h5>
                <h5 className="fw-bold text-neon-blue mb-2">ALSO AVAILABLE</h5>
                <p className="small text-muted mb-3" style={{fontSize: '0.65rem'}}>& SOCIAL MARKETING TEAM</p>
                <div className="d-flex justify-content-center gap-4 mb-3">
                    <i className="bi bi-credit-card fs-3 text-muted"></i>
                    <i className="bi bi-megaphone fs-3 text-muted"></i>
                </div>
                <p className="small text-muted fst-italic mb-0" style={{fontSize: '0.75rem'}}>Expertise in lead generation for funders like you!</p>
            </div>

            {/* Weekly To-Do */}
            <div className="panel-dark h-100">
                <div className="d-flex justify-content-between align-items-center mb-3">
                    <h4 className="text-handwritten text-neon-blue mb-0" style={{fontSize: '1.8rem'}}>Weekly To-Do</h4>
                </div>
                {todos.map(item => (
                    <div key={item.id} className={`custom-check ${item.is_completed ? 'completed' : ''}`} onClick={() => toggleTodo(item.id)}>
                        <i className={`bi ${item.is_completed ? 'bi-check-square-fill' : 'bi-square'}`}></i>
                        <span>{item.text}</span>
                    </div>
                ))}
            </div>

        </Col>
      </Row>

      {/* ========================================= */}
      {/* FOOTER ROW                                */}
      {/* ========================================= */}
      <div className="panel-dark footer-glow mt-3 p-0 border-0">
          <Row className="g-0 border-bottom border-secondary">
              <Col md={4} className="footer-box d-flex align-items-center">
                  <div className="footer-icon"><i className="bi bi-bar-chart-fill"></i></div>
                  <div>
                      <div className="text-white small fw-bold">NEED SUPPORT TO SCALE?</div>
                      <div className="text-muted" style={{fontSize: '0.65rem'}}>We've got access to reliable vendor connections to help your clients boost scores fast.</div>
                  </div>
              </Col>
              <Col md={4} className="footer-box d-flex align-items-center">
                  <div className="footer-icon"><i className="bi bi-people-fill"></i></div>
                  <div>
                      <div className="text-white small fw-bold">NEED A BACKEND TEAM?</div>
                      <div className="text-muted" style={{fontSize: '0.65rem'}}>Let us handle the heavy lifting—inquiry removal, updates, and status tracking included.</div>
                  </div>
              </Col>
              <Col md={4} className="footer-box d-flex align-items-center">
                  <div className="footer-icon"><i className="bi bi-phone"></i></div>
                  <div>
                      <div className="text-white small fw-bold">NEED SOCIAL MEDIA HELP?</div>
                      <div className="text-muted" style={{fontSize: '0.65rem'}}>We offer creative support and content that converts.</div>
                  </div>
              </Col>
          </Row>
          <div className="text-center py-3">
              <div className="text-muted small fw-bold mb-1" style={{letterSpacing: '2px'}}>THIS TIER WILL HELP YOU</div>
              <h4 className="fw-bold text-white m-0 d-flex justify-content-center align-items-center gap-3">
                  <i className="bi bi-brightness-alt-high-fill text-neon-blue fs-5"></i> 
                  <span>21 CLIENTS AWAY FROM <span className="text-neon-blue">INNER CIRCLE.</span></span>
                  <i className="bi bi-brightness-alt-high-fill text-neon-blue fs-5"></i>
              </h4>
          </div>
      </div>

      {/* UPLOAD MODAL */}
      <Modal show={uploadModal.show} onHide={closeUploadModal} centered>
          <Modal.Header closeButton className="border-0 bg-dark text-white pb-0">
              <Modal.Title className="fw-bold h5 text-neon-blue">Update Vision Goal</Modal.Title>
          </Modal.Header>
          <Modal.Body className="bg-dark text-white">
              <Form onSubmit={handleSaveVisionSlot}>
                  <Form.Group className="mb-4">
                      <Form.Label className="small fw-bold text-muted text-uppercase">Upload Photo</Form.Label>
                      <Form.Control 
                          type="file" 
                          accept="image/*"
                          required
                          onChange={(e) => setUploadModal({ ...uploadModal, file: e.target.files[0] })}
                          className="bg-black border-secondary text-white"
                      />
                  </Form.Group>
                  <div className="d-grid">
                      <Button variant="primary" type="submit" className="fw-bold shadow-sm" style={{background: 'rgba(0, 208, 255, 0.2)', color: '#00D0FF', border: '1px solid #00D0FF'}} disabled={savingUpload}>
                          {savingUpload ? <Spinner size="sm" /> : "Save to Vision Board"}
                      </Button>
                  </div>
              </Form>
          </Modal.Body>
      </Modal>

    </div>
  );
}