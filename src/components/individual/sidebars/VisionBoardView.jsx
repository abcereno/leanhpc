import React, { useState, useEffect, useRef } from "react";
import { Row, Col, Spinner, Button, Modal, Form } from "react-bootstrap";
import { supabase } from "../../../supabaseClient";
import { useToast } from "../../shared/ui/ToastNotifier";

// Reliable fallback images
const defaultImages = {
  travel: "https://images.pexels.com/photos/3225517/pexels-photo-3225517.jpeg?auto=compress&cs=tinysrgb&w=400",
  home: "https://images.pexels.com/photos/106399/pexels-photo-106399.jpeg?auto=compress&cs=tinysrgb&w=400",
  family: "https://images.pexels.com/photos/1128318/pexels-photo-1128318.jpeg?auto=compress&cs=tinysrgb&w=400",
  business: "https://images.pexels.com/photos/3183150/pexels-photo-3183150.jpeg?auto=compress&cs=tinysrgb&w=400"
};

const defaultTitles = {
  travel: "MY DREAM TRAVEL",
  home: "MY DREAM HOME",
  family: "MAKE MY FAMILY PROUD",
  business: "START MY BUSINESS"
};

const defaultNextMoves = [
    { text: "Learn something new", is_completed: true },
    { text: "Build a daily routine", is_completed: true },
    { text: "Understand how money works", is_completed: true },
    { text: "Take one action that moves me forward", is_completed: false },
    { text: "Ask for help when I need it", is_completed: false }
];

const defaultThisWeek = [
    { text: "Learn how credit works", is_completed: true },
    { text: "Check my current situation", is_completed: true },
    { text: "Upload my documents", is_completed: false },
    { text: "Complete my first action step", is_completed: false }
];

const extractStoragePath = (publicUrl) => {
    if (!publicUrl) return null;
    if (publicUrl.includes('/uploads/')) {
        return publicUrl.split('/uploads/')[1].split('?')[0];
    }
    return null;
};

export default function VisionBoardView({ clientId, onNextStep }) {
  const { addToast } = useToast();
  const [boardImages, setBoardImages] = useState(defaultImages);
  const [boardTitles, setBoardTitles] = useState(defaultTitles);
  const [loading, setLoading] = useState(true);
  
  const [uploadModal, setUploadModal] = useState({ show: false, slot: null, title: '', file: null });
  const [savingUpload, setSavingUpload] = useState(false);

  const [todos, setTodos] = useState({ next_moves: [], this_week: [] });

  const fetchDashboardData = async () => {
    if (!clientId) {
        setLoading(false);
        return;
    }

    try {
      const { data: imgData, error: imgError } = await supabase.from('vision_board').select('*').eq('client_id', clientId); 
      if (imgError) throw imgError;

      let fetchedImages = { ...defaultImages };
      let fetchedTitles = { ...defaultTitles };
      
      imgData.forEach(dbRow => {
        if (fetchedImages[dbRow.category] !== undefined && dbRow.image_url) {
            fetchedImages[dbRow.category] = dbRow.image_url;
        }
        if (dbRow.title) {
            fetchedTitles[dbRow.category] = dbRow.title;
        }
      });
      setBoardImages(fetchedImages);
      setBoardTitles(fetchedTitles);

      const { data: todoData, error: todoError } = await supabase.from('client_todos').select('*').eq('client_id', clientId).order('created_at', { ascending: true });
      if (todoError) throw todoError;

      if (todoData.length === 0) {
          const seedData = [
              ...defaultNextMoves.map(t => ({ client_id: clientId, section: 'next_moves', task_text: t.text, is_completed: t.is_completed })),
              ...defaultThisWeek.map(t => ({ client_id: clientId, section: 'this_week', task_text: t.text, is_completed: t.is_completed }))
          ];
          const { data: insertedData } = await supabase.from('client_todos').insert(seedData).select();
          if (insertedData) {
              setTodos({
                  next_moves: insertedData.filter(d => d.section === 'next_moves'),
                  this_week: insertedData.filter(d => d.section === 'this_week')
              });
          }
      } else {
          setTodos({
              next_moves: todoData.filter(d => d.section === 'next_moves'),
              this_week: todoData.filter(d => d.section === 'this_week')
          });
      }

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
      setUploadModal({ show: true, slot: slotKey, title: boardTitles[slotKey], file: null });
  };

  const closeUploadModal = () => {
      setUploadModal({ show: false, slot: null, title: '', file: null });
  };

  const handleSaveVisionSlot = async (e) => {
    e.preventDefault();
    if (!clientId) return addToast({ title: "System Error", message: "Client ID is missing. Please refresh.", variant: "danger", icon: "bi-exclamation-triangle-fill" });

    const { slot, title, file } = uploadModal;
    setSavingUpload(true);

    try {
      const { data: existingDocs } = await supabase
          .from('vision_board')
          .select('id, image_url')
          .eq('client_id', clientId)
          .eq('category', slot)
          .limit(1);

      const existingDoc = existingDocs?.[0];
      let finalUrl = existingDoc ? existingDoc.image_url : defaultImages[slot];

      if (file) {
          const fileExt = file.name.split('.').pop();
          const storagePath = `${clientId}/vision_${slot}_${Date.now()}.${fileExt}`;

          const { error: uploadError } = await supabase.storage.from('uploads').upload(storagePath, file);
          if (uploadError) throw uploadError;

          const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(storagePath);
          finalUrl = `${publicUrl}?t=${Date.now()}`;

          if (existingDoc) {
              let oldPath = extractStoragePath(existingDoc.image_url);
              if (oldPath) await supabase.storage.from('uploads').remove([oldPath]).catch(err => console.log("Cleanup error:", err));
          }
      }

      if (existingDoc) {
          await supabase.from('vision_board').update({ image_url: finalUrl, title: title }).eq('id', existingDoc.id);
      } else {
          await supabase.from('vision_board').insert({ client_id: clientId, category: slot, image_url: finalUrl, title: title });
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

  const handleToggleTodo = async (id, currentStatus) => {
      const newStatus = !currentStatus;
      setTodos(prev => ({
          next_moves: prev.next_moves.map(t => t.id === id ? { ...t, is_completed: newStatus } : t),
          this_week: prev.this_week.map(t => t.id === id ? { ...t, is_completed: newStatus } : t)
      }));
      await supabase.from('client_todos').update({ is_completed: newStatus }).eq('id', id);
  };

  const handleUpdateTodoText = async (id, newText) => {
      if (!newText.trim()) return;
      setTodos(prev => ({
          next_moves: prev.next_moves.map(t => t.id === id ? { ...t, task_text: newText } : t),
          this_week: prev.this_week.map(t => t.id === id ? { ...t, task_text: newText } : t)
      }));
      await supabase.from('client_todos').update({ task_text: newText }).eq('id', id);
  };

  const handleAddTodo = async (section) => {
      const { data } = await supabase.from('client_todos').insert({ client_id: clientId, section: section, task_text: "New Task" }).select().single();
      if (data) {
          setTodos(prev => ({ ...prev, [section]: [...prev[section], data] }));
      }
  };

  const handleDeleteTodo = async (id, section) => {
      setTodos(prev => ({ ...prev, [section]: prev[section].filter(t => t.id !== id) }));
      await supabase.from('client_todos').delete().eq('id', id);
  };

  if (loading) {
      return <div className="d-flex justify-content-center align-items-center vh-100"><Spinner animation="border" variant="primary" /></div>;
  }

  return (
    <div className="dashboard-wrapper p-3 p-md-4 animate-fade-in">

      <Row className="g-3">
        {/* LEFT COLUMN */}
        <Col lg={4} className="d-flex flex-column gap-3">
          <div className="panel-dark panel-neon-glow">
            <h6 className="fw-bold mb-1 text-light letter-spacing-1">WELCOME TO</h6>
            <h1 className="fw-bold text-neon-blue display-6 mb-3">YOUR FRESH START</h1>
            <p className="text-light opacity-75 small mb-1">You're not here to be average.</p>
            <p className="text-light opacity-75 small mb-4">You're here to build the life you deserve.</p>
            <div className="text-handwritten fs-1 ms-3 mt-2" style={{ transform: 'rotate(-3deg)' }}>
              It all starts with a Vision. <i className="bi bi-stars ms-2"></i>
            </div>
          </div>

          <div className="panel-dark">
            <h6 className="fw-bold text-neon-blue mb-1"><i className="bi bi-image me-2"></i>YOUR VISION BOARD</h6>
            <p className="small text-muted mb-4">What do you want your life to look like?</p>
            
            <div className="vision-grid">
              <div className="vision-slot" onClick={() => openUploadModal('travel')}>
                <img src={boardImages.travel} alt="Travel" />
                <div className="upload-overlay"><i className="bi bi-camera-fill"></i></div>
                <div className="vision-slot-label"><span>{boardTitles.travel}</span><i className="bi bi-suit-heart-fill text-neon-blue"></i></div>
              </div>
              <div className="vision-slot" onClick={() => openUploadModal('home')}>
                <img src={boardImages.home} alt="Home" />
                <div className="upload-overlay"><i className="bi bi-camera-fill"></i></div>
                <div className="vision-slot-label"><span>{boardTitles.home}</span><i className="bi bi-suit-heart-fill text-neon-blue"></i></div>
              </div>
              <div className="vision-slot" onClick={() => openUploadModal('family')}>
                <img src={boardImages.family} alt="Family" />
                <div className="upload-overlay"><i className="bi bi-camera-fill"></i></div>
                <div className="vision-slot-label"><span>{boardTitles.family}</span><i className="bi bi-suit-heart-fill text-neon-blue"></i></div>
              </div>
              <div className="vision-slot" onClick={() => openUploadModal('business')}>
                <img src={boardImages.business} alt="Business" />
                <div className="upload-overlay"><i className="bi bi-camera-fill"></i></div>
                <div className="vision-slot-label"><span>{boardTitles.business}</span><i className="bi bi-suit-heart-fill text-neon-blue"></i></div>
              </div>
            </div>

            <div className="mt-4 text-center text-handwritten fs-4">
               <i className="bi bi-star me-2"></i> Dream it. Plan it. Work for it. Live it. The life you want is waiting for you.
            </div>
          </div>

          <div className="panel-dark text-center py-5 border-0" style={{ background: 'linear-gradient(to bottom, #111, #080A0E)' }}>
            <i className="bi bi-lightning-charge text-neon-blue fs-1 mb-2 d-block"></i>
            <h3 className="fw-bold text-white m-0" style={{ letterSpacing: '2px' }}>DISCIPLINE TODAY</h3>
            <h3 className="fw-bold text-neon-blue m-0" style={{ letterSpacing: '2px' }}>FREEDOM TOMORROW</h3>
          </div>
        </Col>

        {/* CENTER COLUMN */}
        <Col lg={4} className="d-flex flex-column gap-3">
          <div className="panel-dark">
            <h6 className="fw-bold text-neon-blue mb-4"><i className="bi bi-suit-heart me-2"></i>AFFIRMATIONS</h6>
            <div className="check-item"><i className="bi bi-check-circle check-icon"></i> I am becoming the best version of myself.</div>
            <div className="check-item"><i className="bi bi-check-circle check-icon"></i> I am in control of my future.</div>
            <div className="check-item"><i className="bi bi-check-circle check-icon"></i> I learn, I grow, I level up every day.</div>
            <div className="check-item"><i className="bi bi-check-circle check-icon"></i> I attract opportunities and make the most of them.</div>
            <div className="check-item"><i className="bi bi-check-circle check-icon"></i> I am building a life I love.</div>
          </div>

          <div className="panel-dark">
            <h6 className="fw-bold text-neon-blue mb-4"><i className="bi bi-bullseye me-2"></i>WHY YOU'RE DOING THIS</h6>
            <div className="check-item"><i className="bi bi-star check-icon"></i> To live life on my own terms</div>
            <div className="check-item"><i className="bi bi-diamond check-icon"></i> To create financial independence</div>
            <div className="check-item"><i className="bi bi-people check-icon"></i> To help and take care of my family</div>
            <div className="check-item"><i className="bi bi-suit-heart check-icon"></i> To wake up excited about my future</div>
            <div className="check-item"><i className="bi bi-gem check-icon"></i> To leave a legacy I'm proud of</div>
          </div>

          <div className="panel-dark">
            <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="fw-bold text-neon-blue mb-0"><i className="bi bi-rocket me-2"></i>YOUR NEXT MOVES</h6>
                <button className="add-todo-btn" onClick={() => handleAddTodo('next_moves')}><i className="bi bi-plus"></i> Add</button>
            </div>
            <p className="small text-muted mb-4">What are you focusing on right now?</p>
            
            {todos.next_moves.map(task => (
                <div key={task.id} className={`check-item ${task.is_completed ? 'completed' : ''}`}>
                    <i className={`bi ${task.is_completed ? 'bi-check-square-fill' : 'bi-square'} check-icon`} onClick={() => handleToggleTodo(task.id, task.is_completed)}></i>
                    <input type="text" className="todo-input" value={task.task_text} onChange={(e) => handleUpdateTodoText(task.id, e.target.value)} onBlur={(e) => handleUpdateTodoText(task.id, e.target.value)} />
                    <button className="delete-btn" onClick={() => handleDeleteTodo(task.id, 'next_moves')}><i className="bi bi-x-lg m-0 text-danger fs-6"></i></button>
                </div>
            ))}
          </div>

          <div className="panel-dark">
            <h6 className="fw-bold text-light mb-4 text-center">WHAT CHANGES WHEN YOU FOLLOW THROUGH?</h6>
            <div className="icon-grid">
               <div className="icon-box"><i className="bi bi-brain"></i><span>You stop feeling lost</span></div>
               <div className="icon-box"><i className="bi bi-shield-check"></i><span>You gain confidence</span></div>
               <div className="icon-box"><i className="bi bi-lightbulb"></i><span>You understand how things work</span></div>
               <div className="icon-box"><i className="bi bi-bullseye"></i><span>You make better decisions</span></div>
               <div className="icon-box"><i className="bi bi-rocket-takeoff"></i><span>You start creating your own path</span></div>
            </div>
          </div>
        </Col>

        {/* RIGHT COLUMN */}
        <Col lg={4} className="d-flex flex-column gap-3">
          <div className="panel-dark">
            <h6 className="fw-bold text-neon-blue mb-4"><i className="bi bi-graph-up-arrow me-2"></i>YOUR PROGRESS</h6>
            <div className="progress-stepper">
                <div className="step-node">
                    <div className="step-circle active"><span>LEVEL</span><strong>4</strong></div>
                    <div className="fw-bold text-neon-blue">TAKING CONTROL <i className="bi bi-lock-fill ms-2 text-muted"></i></div>
                    <div className="small text-muted">Building momentum and seeing results.</div>
                </div>
                <div className="step-node">
                    <div className="step-circle"><span>LEVEL</span><strong>3</strong></div>
                    <div className="fw-bold text-light">FINDING MY WAY <i className="bi bi-lock-fill ms-2 text-muted"></i></div>
                    <div className="small text-muted">I'm taking action and making progress.</div>
                </div>
                <div className="step-node">
                    <div className="step-circle"><span>LEVEL</span><strong>2</strong></div>
                    <div className="fw-bold text-light">GETTING STARTED <i className="bi bi-lock-fill ms-2 text-muted"></i></div>
                    <div className="small text-muted">I'm learning and building my foundation.</div>
                </div>
                <div className="step-node">
                    <div className="step-circle border-secondary text-secondary"><span>LEVEL</span><strong>1</strong></div>
                    <div className="fw-bold text-muted">JUST BEGINNING</div>
                    <div className="small text-muted">Every journey starts with a single step.</div>
                </div>
            </div>
            
            <div className="mt-4 pt-3 border-top border-secondary text-center">
                <div className="text-handwritten fs-4 mb-2"><i className="bi bi-star me-1"></i> You're on your way!</div>
                <div className="text-muted small fst-italic">Keep going, your future is closer than you think.</div>
            </div>
          </div>

          <div className="panel-dark">
            <div className="d-flex justify-content-between align-items-center mb-2">
                <h6 className="fw-bold text-neon-blue mb-0"><i className="bi bi-calendar3 me-2"></i>THIS WEEK</h6>
                <button className="add-todo-btn" onClick={() => handleAddTodo('this_week')}><i className="bi bi-plus"></i> Add</button>
            </div>
            <p className="small text-muted mb-4">What are you doing this week?</p>
            
            {todos.this_week.map(task => (
                <div key={task.id} className={`check-item ${task.is_completed ? 'completed' : ''}`}>
                    <i className={`bi ${task.is_completed ? 'bi-check-square-fill' : 'bi-square'} check-icon`} onClick={() => handleToggleTodo(task.id, task.is_completed)}></i>
                    <input type="text" className="todo-input" value={task.task_text} onChange={(e) => handleUpdateTodoText(task.id, e.target.value)} onBlur={(e) => handleUpdateTodoText(task.id, e.target.value)} />
                    <button className="delete-btn" onClick={() => handleDeleteTodo(task.id, 'this_week')}><i className="bi bi-x-lg m-0 text-danger fs-6"></i></button>
                </div>
            ))}
            
            <div className="mt-4 text-handwritten text-neon-blue fs-4 text-center">
                Small steps every day lead to big changes. <i className="bi bi-lightning-fill"></i>
            </div>
          </div>

          <div className="sticky-note flex-grow-1">
             <div className="sticky-pin"></div>
             <div className="text-uppercase fs-6 fw-bold mb-2 font-monospace">NOTE TO SELF <i className="bi bi-suit-heart ms-1"></i></div>
             I am proud of how far I've come and excited for what's next. ☺
          </div>
        </Col>
      </Row>

      {/* FOOTER BAR WITH NAVIGATION */}
      <div className="mt-3 p-4 rounded d-flex flex-column flex-md-row justify-content-between align-items-center bg-black footer-glow">
          <div className="text-light fw-bold letter-spacing-1 text-center text-md-start mb-3 mb-md-0" style={{ letterSpacing: '1px' }}>
              <i className="bi bi-star text-neon-blue me-2"></i> YOUR FUTURE IS CREATED BY WHAT YOU DO <span className="text-neon-blue">TODAY</span>, NOT TOMORROW.
          </div>
          <Button variant="outline-primary" className="fw-bold px-4 py-2 rounded-0 border-2 text-neon-blue border-primary glowing-btn" onClick={() => { if(onNextStep) onNextStep(); }}>
              TAKE MY NEXT STEP <i className="bi bi-arrow-right ms-2"></i>
          </Button>
      </div>

      {/* UPDATE MODAL */}
      <Modal show={uploadModal.show} onHide={closeUploadModal} centered>
          <Modal.Header closeButton className="border-0 bg-dark text-white pb-0">
              <Modal.Title className="fw-bold h5 text-neon-blue">Update Vision Goal</Modal.Title>
          </Modal.Header>
          <Modal.Body className="bg-dark text-white">
              <Form onSubmit={handleSaveVisionSlot}>
                  <Form.Group className="mb-4">
                      <Form.Label className="small fw-bold text-muted text-uppercase">Vision Title</Form.Label>
                      <Form.Control 
                          type="text" 
                          placeholder="e.g. My Dream House" 
                          value={uploadModal.title}
                          onChange={(e) => setUploadModal({ ...uploadModal, title: e.target.value })}
                          className="bg-black border-secondary text-white"
                          maxLength={30}
                      />
                      <Form.Text className="text-muted" style={{fontSize: '0.75rem'}}>Keep it short (max 30 characters).</Form.Text>
                  </Form.Group>
                  <Form.Group className="mb-4">
                      <Form.Label className="small fw-bold text-muted text-uppercase">Upload Photo (Optional)</Form.Label>
                      <Form.Control 
                          type="file" 
                          accept="image/*"
                          onChange={(e) => setUploadModal({ ...uploadModal, file: e.target.files[0] })}
                          className="bg-black border-secondary text-white"
                      />
                  </Form.Group>
                  <div className="d-grid">
                      <Button variant="primary" type="submit" className="fw-bold shadow-sm" disabled={savingUpload}>
                          {savingUpload ? <Spinner size="sm" /> : "Save to Vision Board"}
                      </Button>
                  </div>
              </Form>
          </Modal.Body>
      </Modal>

    </div>
  );
}