// components/ToastNotifier.jsx
import { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";
import { Toast, ToastContainer } from "react-bootstrap";
import { useLocation } from "react-router-dom";
import { v4 as uuidv4 } from "uuid";

const MAX_VISIBLE = 3;
const DEFAULT_TOAST_TIMEOUT = 5000;

const ToastContext = createContext(null);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider");
  return context;
};

export default function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const location = useLocation();
  const lastLocationRef = useRef(location.pathname);
  const timeoutsRef = useRef({}); 

  const addToast = useCallback(
    ({ message, variant = "info", title = "Notification", icon = "bi-bell", timeout = DEFAULT_TOAST_TIMEOUT, sound = null }) => {
      const id = uuidv4();

      // 👇 NEW: Play the sound if one was provided 👇
      if (sound) {
        const audio = new Audio(sound);
        // Browsers block autoplay if the user hasn't clicked anywhere on the page yet.
        // The .catch() prevents the app from crashing if the browser blocks the audio.
        audio.play().catch((err) => console.warn("Audio blocked by browser policy:", err));
      }

      setToasts((prev) => {
        const exists = prev.some((t) => t.message === message && t.title === title);
        if (exists) return prev;

        const limited = prev.slice(-MAX_VISIBLE + 1);
        return [...limited, { id, message, variant, title, icon }];
      });

      timeoutsRef.current[id] = setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
        delete timeoutsRef.current[id];
      }, timeout);
    },
    []
  );

  useEffect(() => {
    if (location.pathname !== lastLocationRef.current) {
      lastLocationRef.current = location.pathname;
      setToasts([]);
      Object.values(timeoutsRef.current).forEach(clearTimeout);
      timeoutsRef.current = {};
    }
  }, [location]);

  useEffect(() => {
    return () => {
      Object.values(timeoutsRef.current).forEach(clearTimeout);
    };
  }, []);

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <ToastContainer className="p-3 position-fixed" position="top-end" style={{ zIndex: 9999 }}>
        {toasts.map((toast) => (
          <Toast key={toast.id} bg={toast.variant} animation className="mb-2 shadow-lg">
            <Toast.Header closeButton>
              <i className={`bi ${toast.icon} me-2 text-${toast.variant}`}></i>
              <strong className="me-auto text-dark">{toast.title}</strong>
            </Toast.Header>
            <Toast.Body className={toast.variant === 'light' ? "text-dark" : "text-white fw-bold"}>
              {toast.message}
            </Toast.Body>
          </Toast>
        ))}
      </ToastContainer>
    </ToastContext.Provider>
  );
}