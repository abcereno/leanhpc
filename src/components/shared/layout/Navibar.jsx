// import { useEffect, useState } from "react";
// import { useAuth } from "../../../context/AuthContext";
// import { supabase } from "../../../supabaseClient";
// import { useNavigate, NavLink, Link } from "react-router-dom";
// import { useTheme } from "../ui/ThemeContext";
// import {
//   Navbar, Nav, Container, NavDropdown, Form,
//   Modal, Button, Spinner, Alert, Badge
// } from "react-bootstrap";
// import img from "../../../assets/hpc-lock.png";
// import AlertBell from "../../admin/AlertBell";

// export default function Navibar() {
//   const {
//     isAuthenticated,
//     user,
//     role,
//     isAdmin,
//     isOwner,
//     signOut,
//     isDeveloper, 
//     userId       
//   } = useAuth();

//   const isSubAdmin = role === "subadmin";
//   const isCaller = role === "caller";
//   const isCounter = role === "counter";
//   const isCallCount = role === "callcount";

//   const [adminName, setAdminName] = useState("");
  
//   useEffect(() => {
//     let cancelled = false;
//     const loadName = async () => {
//       if (!isAuthenticated || !user?.id) {
//         if (!cancelled) setAdminName("");
//         return;
//       }
//       const { data, error } = await supabase
//         .from("profiles")
//         .select("full_name")
//         .eq("id", user.id)
//         .maybeSingle();
//       if (!cancelled) {
//         setAdminName(error ? "" : (data?.full_name || ""));
//       }
//     };
//     loadName();
//     return () => { cancelled = true; };
//   }, [isAuthenticated, user?.id]);

//   const navigate = useNavigate();
//   const { darkMode, setDarkMode } = useTheme();

// const handleLogout = async () => {
//   await signOut();
//   // We use replace: true so they can't "back button" into the dashboard
//   navigate('/login', { replace: true });
// };

//   // ─────────────────────────────────────────────────────────────
//   // THREADS LOGIC
//   // ─────────────────────────────────────────────────────────────
//   const [showThreads, setShowThreads] = useState(false);
//   const [threadClients, setThreadClients] = useState([]);
//   const [clientsLoading, setClientsLoading] = useState(false);
//   const [threadsLoading, setThreadsLoading] = useState(false);
//   const [feed, setFeed] = useState([]); 
//   const [selectedThreadClient, setSelectedThreadClient] = useState("");
//   const [postText, setPostText] = useState("");
//   const [replyDrafts, setReplyDrafts] = useState({}); 
//   const [flash, setFlash] = useState("");

//   const openThreads = async () => {
//     setShowThreads(true);
//     setFlash("");
//     await loadThreadClients(); 
//   };
//   const closeThreads = () => {
//     setShowThreads(false);
//     setSelectedThreadClient("");
//     setPostText("");
//     setReplyDrafts({});
//     setFeed([]);
//     setFlash("");
//   };

//   async function loadThreadClients() {
//     setClientsLoading(true);
//     const PAGE = 1000;
//     let page = 0;
//     const all = [];
//     try {
//       const canSeeAll = (isAdmin || isOwner || isSubAdmin || isCallCount);
//       while (true) {
//         let q = supabase
//           .from("clients")
//           .select("id, full_name")
//           .order("full_name", { ascending: true })
//           .range(page * PAGE, page * PAGE + PAGE - 1);

//         if (!canSeeAll && user?.id) q = q.eq("admin_id", user.id);

//         const { data, error } = await q;
//         if (error) throw error;

//         const rows = data || [];
//         all.push(...rows);

//         if (rows.length < PAGE) break; 
//         page += 1;
//       }

//       const byId = new Map();
//       for (const c of all) byId.set(c.id, c);
//       const collator = new Intl.Collator("en", { sensitivity: "base" });
//       const sorted = Array.from(byId.values()).sort((a, b) =>
//         collator.compare(a.full_name || "", b.full_name || "")
//       );

//       setThreadClients(sorted);
//     } catch (e) {
//       console.error("loadThreadClients error:", e);
//     } finally {
//       setClientsLoading(false);
//     }
//   }

//   function buildFeed(rows) {
//     const byId = {};
//     rows.forEach(r => { byId[r.id] = { ...r, replies: [] }; });
//     const roots = [];
//     rows.forEach(r => {
//       if (r.parent_id) {
//         if (byId[r.parent_id]) byId[r.parent_id].replies.push(byId[r.id]);
//       } else {
//         roots.push(byId[r.id]);
//       }
//     });
//     roots.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
//     roots.forEach(p => p.replies.sort((a,b) => new Date(a.timestamp) - new Date(b.timestamp)));
//     return roots;
//   }

//   async function loadFeed(clientId) {
//     if (!clientId) return;
//     try {
//       setThreadsLoading(true);
//       const { data, error } = await supabase
//         .from("comments")
//         .select("id, client_id, text, author, parent_id, timestamp")
//         .eq("client_id", clientId)
//         .order("timestamp", { ascending: true });
//       if (error) throw error;
//       setFeed(buildFeed(data || []));
//     } catch (e) {
//       console.error(e);
//     } finally {
//       setThreadsLoading(false);
//     }
//   }

//   useEffect(() => {
//     if (!showThreads || !selectedThreadClient) return;
//     const channel = supabase
//       .channel(`comments-${selectedThreadClient}`)
//       .on(
//         "postgres_changes",
//         { event: "*", schema: "public", table: "comments", filter: `client_id=eq.${selectedThreadClient}` },
//         () => loadFeed(selectedThreadClient)
//       )
//       .subscribe();
//     return () => { supabase.removeChannel(channel); };
//   }, [showThreads, selectedThreadClient]);

//   useEffect(() => {
//     if (selectedThreadClient) loadFeed(selectedThreadClient);
//   }, [selectedThreadClient]);

//   async function submitPost() {
//     setFlash("");
//     const text = postText.trim();
//     if (!selectedThreadClient) return setFlash("Pick a client first.");
//     if (!text) return setFlash("Write something first.");
//     try {
//       const row = {
//         id: crypto.randomUUID(),
//         client_id: selectedThreadClient,
//         text,
//         author: adminName || user?.email || "Anonymous",
//         parent_id: null,
//         timestamp: new Date().toISOString(),
//       };
//       const { error } = await supabase.from("comments").insert([row]);
//       if (error) throw error;
//       setPostText("");
//     } catch (e) {
//       setFlash(`❌ ${e.message || e}`);
//     } finally {
//       setTimeout(() => setFlash(""), 3000);
//     }
//   }

//   async function submitReply(parentId) {
//     setFlash("");
//     const text = (replyDrafts[parentId] || "").trim();
//     if (!text) return;
//     try {
//       const row = {
//         id: crypto.randomUUID(),
//         client_id: selectedThreadClient,
//         text,
//         author: adminName || user?.email || "Anonymous",
//         parent_id: parentId,
//         timestamp: new Date().toISOString(),
//       };
//       const { error } = await supabase.from("comments").insert([row]);
//       if (error) throw error;
//       setReplyDrafts(prev => ({ ...prev, [parentId]: "" }));
//     } catch (e) {
//       setFlash(`❌ ${e.message || e}`);
//     } finally {
//       setTimeout(() => setFlash(""), 3000);
//     }
//   }

//   function relTime(iso) {
//     if (!iso) return "";
//     const s = Math.max(1, Math.floor((Date.now() - new Date(iso).getTime())/1000));
//     if (s < 60) return `${s}s`;
//     const m = Math.floor(s/60);
//     if (m < 60) return `${m}m`;
//     const h = Math.floor(m/60);
//     if (h < 24) return `${h}h`;
//     const d = Math.floor(h/24);
//     return `${d}d`;
//   }

//   return (
//     <>
//       <style>
//         {`
//           .navbar-custom {
//             background-color: var(--bg-card);
//             border-bottom: 1px solid var(--border-color);
//             box-shadow: 0 4px 20px rgba(0,0,0,0.4);
//           }
//           .navbar-brand {
//             color: var(--text-primary) !important;
//             font-weight: 700;
//             letter-spacing: -0.5px;
//           }
//           .navbar-nav .nav-link {
//             color: var(--primary-blue) !important;
//             font-weight: 500;
//             transition: all 0.2s ease;
//           }
//           .navbar-nav .nav-link:hover, .navbar-nav .nav-link.active {
//             color: #38BDF8 !important;
//             text-shadow: 0 0 8px var(--primary-glow);
//           }
//           .dropdown-menu {
//             background-color: var(--bg-card);
//             border: 1px solid var(--border-color);
//             box-shadow: 0 10px 30px rgba(0,0,0,0.5);
//           }
//           .dropdown-item { color: var(--text-secondary); }
//           .dropdown-item:hover, .dropdown-item:focus {
//             background-color: var(--bg-hover);
//             color: var(--primary-blue);
//           }
//           .navbar-toggler { border-color: var(--border-color); }
//           .navbar-toggler-icon { filter: invert(1) grayscale(100%) brightness(200%); }
//         `}
//       </style>

//       <Navbar expand="lg" className="p-3 navbar-custom" variant="dark">
//         <Container fluid> 
//           <div className="d-flex">
//           <img src={img} alt="Logo" height="30" className="d-inline-block align-top me-2 rounded-circle" />
          
//           <Navbar.Brand as={NavLink} to={isDeveloper ? `/admin/${userId}` : "/admin-dashboard"}>
//             Hidden Partner Cloud™
//             {isDeveloper && <Badge bg="info" className="ms-2 small align-middle">DEV</Badge>}
//           </Navbar.Brand>

//           <Navbar.Toggle aria-controls="admin-navbar-nav" /></div>
//           <Navbar.Collapse id="admin-navbar-nav">
//             {isAuthenticated ? (
//               <>
//                 {/* === LEFT SIDE NAVIGATION (DASHBOARD, ETC.) === */}
//                 <Nav className="me-auto">
//                   {/* 🔒 HIDDEN FOR DEVELOPERS */}
//                   {!isDeveloper && (
//                     <>
//                       <Nav.Link as={NavLink} to="/admin-dashboard">Dashboard</Nav.Link>
//                       <Nav.Link as={NavLink} to="/clients">Client List</Nav.Link>

//                       <NavDropdown title={<span className="text-primary fw-bold">Activity</span>} id="activity-dropdown">
//                         {(isCaller || isAdmin || isSubAdmin || isCallCount || isOwner) && (
//                           <NavDropdown.Item as={NavLink} to="/pending-callbacks">
//                             Pending Callbacks
//                           </NavDropdown.Item>
//                         )}
//                         {(isCounter || isAdmin || isSubAdmin || isCallCount || isOwner) && (
//                           <NavDropdown.Item as={NavLink} to="/identify-inquiries">
//                             Count Inquiries
//                           </NavDropdown.Item>
//                         )}
//                         {(isCounter || isAdmin || isSubAdmin || isCallCount || isOwner) && (
//                           <NavDropdown.Item as={NavLink} to="/call-routing">
//                             Call Routing
//                           </NavDropdown.Item>
//                         )}
//                         {(isCounter || isAdmin || isSubAdmin || isCallCount || isOwner) && (
//                           <NavDropdown.Item as={NavLink} to="/docs-routing">
//                             Docs Routing
//                           </NavDropdown.Item>
//                         )}
//                         {(isCounter || isAdmin || isSubAdmin || isCallCount || isOwner) && (
//                           <NavDropdown.Item as={NavLink} to="/call-queue">
//                             Call Queue
//                           </NavDropdown.Item>
//                         )}
//                         {(isCounter || isAdmin || isSubAdmin || isCallCount || isOwner) && (
//                           <NavDropdown.Item as={NavLink} to="/ai-testing">
//                             AI Simulation
//                           </NavDropdown.Item>
//                         )}
//                       </NavDropdown>

//                       {(isAdmin || isOwner) && (
//                         <NavDropdown title={<span className="text-primary fw-bold">Management</span>} id="management-dropdown">
//                           {isOwner && (
//                             <>
//                               <NavDropdown.Item as={NavLink} to="/company">Companies</NavDropdown.Item>
//                               <NavDropdown.Item as={NavLink} to="/payroll">Payroll</NavDropdown.Item>
//                             </>
//                           )}
//                           <NavDropdown.Item as={NavLink} to="/admin-directory">Employee Directory</NavDropdown.Item>
//                           <NavDropdown.Item as={NavLink} to="/admin-dashboard">EODs</NavDropdown.Item>
//                           <NavDropdown.Item as={NavLink} to="/employee-time-tracker">Employee Logs</NavDropdown.Item>
//                           <NavDropdown.Item as={NavLink} to="/inquiry-removals">Inquiry Logs</NavDropdown.Item>
//                           <NavDropdown.Item as={NavLink} to="/approve-signups">
//   <i className="bi bi-person-check-fill me-2"></i> Approve Signups
// </NavDropdown.Item>
//                           <NavDropdown.Item as={NavLink} to="/pending-payments">
//   <i className="bi bi-currency-dollar me-2"></i> Pending Payments
// </NavDropdown.Item>
//                           <NavDropdown.Divider className="border-secondary opacity-25" />
//                           <NavDropdown.Item as={NavLink} to="/add-company">Add Company</NavDropdown.Item>
//                           <NavDropdown.Item as={NavLink} to="/add-employee">Add Employee</NavDropdown.Item>
//                           <NavDropdown.Item as={NavLink} to="/company-holidays">Company Holidays</NavDropdown.Item>
//                           <NavDropdown.Item as={NavLink} to="/add-affiliate">Add Affiliate</NavDropdown.Item>
//                           <NavDropdown.Item as={NavLink} to="/call-logs">Call Logs</NavDropdown.Item>
//                           <NavDropdown.Item as={NavLink} to="/document-submissions">Document Submissions</NavDropdown.Item>
//                           <NavDropdown.Item as={NavLink} to="/intake">Intake Dashboard</NavDropdown.Item>
//                           <NavDropdown.Item as={NavLink} to="/funder-eligibility">Funder Eligibility</NavDropdown.Item>
//                           <NavDropdown.Item as={NavLink} to="/activity-logs">Management Logs</NavDropdown.Item>
//                           <NavDropdown.Item as={NavLink} to="/master-sheet">
//                             <i className="bi bi-grid-3x3 me-2"></i>
//                             Master Spreadsheet
//                           </NavDropdown.Item>
//                         </NavDropdown>
//                       )}
//                     </>
//                   )}
//                 </Nav>

//                 {/* === RIGHT SIDE NAVIGATION (PROFILE & TOOLS) === */}
//                 <div className="d-flex align-items-center gap-3">
                  
//                   {/* Hide Tools for Developers */}
//                   {!isDeveloper && (
//                     <>
//                       <AlertBell />
//                       <Button variant="outline-primary" size="sm" onClick={openThreads}>
//                         Threads
//                       </Button>
//                     </>
//                   )}

//                   {/* <Form.Check
//                     type="switch"
//                     id="darkModeSwitch"
//                     checked={darkMode}
//                     onChange={() => setDarkMode((prev) => !prev)}
//                     label={darkMode ? "🌙" : "☀️"}
//                     className="text-light"
//                   /> */}
                  
//                   {/* ✅ PROFILE LINK: VISIBLE TO EVERYONE (INCLUDING DEVELOPERS) */}
//                   <Nav.Link as={Link} to={`/admin/${userId}`} className="d-flex align-items-center text-decoration-none">
//                      <span className="navbar-text text-light small d-none d-lg-block me-2">
//                        Welcome, <strong className="text-primary">{adminName || user?.user_metadata?.full_name || user?.email || "Admin"}</strong>
//                      </span>
//                      <div className="bg-primary text-dark rounded-circle d-flex align-items-center justify-content-center fw-bold" style={{width: '32px', height: '32px', fontSize: '14px'}}>
//                         {adminName?.charAt(0).toUpperCase() || "U"}
//                      </div>
//                   </Nav.Link>
                  
//                   <Button variant="outline-danger" size="sm" onClick={handleLogout}>
//                     Logout
//                   </Button>
//                 </div>
//               </>
//             ) : (
//               <Nav className="ms-auto align-items-center gap-3">
//                 {/* <Form.Check
//                   type="switch"
//                   id="darkModeSwitch"
//                   checked={darkMode}
//                   onChange={() => setDarkMode((prev) => !prev)}
//                   label={darkMode ? "🌙" : "☀️"}
//                   className="text-light"
//                 /> */}
//                 <Nav.Link as={NavLink} to="/login" className="btn btn-dark px-3 fw-bold">Login</Nav.Link>
//               </Nav>
//             )}
//           </Navbar.Collapse>
//         </Container>
//       </Navbar>

//       {/* Threads Modal */}
//       <Modal show={showThreads} onHide={closeThreads} centered size="lg">
//         <Modal.Header closeButton className="bg-dark text-white border-secondary">
//           <Modal.Title className="text-primary">Client Threads</Modal.Title>
//         </Modal.Header>

//         <Modal.Body className="bg-dark text-white">
//           {flash && (
//             <Alert variant={flash.startsWith("❌") ? "danger" : "info"} className="py-2">
//               {flash}
//             </Alert>
//           )}

//           <div className="row g-3 mb-3">
//             <div className="col-md-6">
//               <Form.Label className="text-muted small text-uppercase fw-bold">Select Client</Form.Label>
//               <Form.Select
//                 className="bg-secondary text-white border-0"
//                 value={selectedThreadClient}
//                 onChange={(e) => setSelectedThreadClient(e.target.value)}
//                 disabled={clientsLoading}
//               >
//                 <option value="">{clientsLoading ? "Loading…" : "Select client…"}</option>
//                 {threadClients.map(c => (
//                   <option key={c.id} value={c.id}>{c.full_name}</option>
//                 ))}
//               </Form.Select>
//               {clientsLoading && (
//                 <div className="small text-muted mt-1">
//                   <Spinner size="sm" /> Loading clients…
//                 </div>
//               )}
//             </div>
//           </div>

//           <Form className="mb-3">
//             <Form.Control
//               as="textarea"
//               rows={3}
//               placeholder="What's on your mind?"
//               value={postText}
//               onChange={(e) => setPostText(e.target.value)}
//               disabled={!selectedThreadClient}
//               className="bg-secondary text-white border-0"
//             />
//             <div className="d-flex justify-content-end mt-2">
//               <Button onClick={submitPost} disabled={!selectedThreadClient || !postText.trim()} variant="primary">
//                 Post
//               </Button>
//             </div>
//           </Form>

//           {threadsLoading ? (
//             <div className="text-center py-4"><Spinner animation="border" variant="primary" /></div>
//           ) : !selectedThreadClient ? (
//             <div className="text-center text-muted py-4 border rounded border-secondary border-opacity-25">
//                <i className="bi bi-arrow-up-circle fs-3 d-block mb-2"></i>
//                Pick a client above to view their thread.
//             </div>
//           ) : feed.length === 0 ? (
//             <Alert variant="info" className="bg-opacity-10 border-info text-info">No posts yet. Be the first to post!</Alert>
//           ) : (
//             <div className="vstack gap-3">
//               {feed.map(post => (
//                 <div key={post.id} className="p-3 rounded bg-secondary bg-opacity-10 border border-secondary border-opacity-25">
//                   <div className="d-flex justify-content-between align-items-center mb-2">
//                     <strong className="text-primary">{post.author || "Unknown"}</strong>
//                     <small className="text-muted" style={{fontSize: '0.75rem'}}>{relTime(post.timestamp)}</small>
//                   </div>
//                   <div className="text-white mb-3" style={{ whiteSpace: "pre-wrap" }}>{post.text}</div>

//                   <div className="mt-3 ps-3 border-start border-secondary">
//                     {post.replies.map(r => (
//                       <div key={r.id} className="mb-2">
//                         <div className="d-flex justify-content-between align-items-center">
//                           <strong className="text-info small">{r.author || "Unknown"}</strong>
//                           <small className="text-muted" style={{fontSize: '0.7rem'}}>{relTime(r.timestamp)}</small>
//                         </div>
//                         <div className="text-light small opacity-75" style={{ whiteSpace: "pre-wrap" }}>{r.text}</div>
//                       </div>
//                     ))}

//                     <div className="d-flex gap-2 mt-3">
//                       <Form.Control
//                         size="sm"
//                         placeholder="Write a reply…"
//                         value={replyDrafts[post.id] || ""}
//                         onChange={(e) => setReplyDrafts(prev => ({ ...prev, [post.id]: e.target.value }))}
//                         className="bg-dark text-white border-secondary"
//                       />
//                       <Button
//                         size="sm"
//                         variant="outline-light"
//                         onClick={() => submitReply(post.id)}
//                         disabled={!(replyDrafts[post.id] || "").trim()}
//                       >
//                         Reply
//                       </Button>
//                     </div>
//                   </div>
//                 </div>
//               ))}
//             </div>
//           )}
//         </Modal.Body>

//         <Modal.Footer className="bg-dark text-white border-top border-secondary">
//           <Button variant="outline-light" onClick={closeThreads}>
//             Close
//           </Button>
//         </Modal.Footer>
//       </Modal>
//     </>
//   );
// }