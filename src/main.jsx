import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'bootstrap/dist/css/bootstrap.min.css'
import "bootstrap/dist/js/bootstrap.bundle.min";
import App from './App.jsx'
import "normalize.css";
import './index.css'
import { NotificationProvider } from './context/NotificationContext.jsx';
createRoot(document.getElementById('root')).render(
  // <StrictMode>
    <NotificationProvider>
      <App />
    </NotificationProvider>
  // </StrictMode>,
)
