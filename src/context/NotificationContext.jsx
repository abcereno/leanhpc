import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';

const NotificationContext = createContext();

export const NotificationProvider = ({ children }) => {
  const [notifications, setNotifications] = useState([]);

  // HEARTBEAT LOG: Tracks when the Context initializes or refreshes
  useEffect(() => {
    console.log("🔔 [NotificationContext]: System initialized and listening for events.");
    
    return () => console.log("🔕 [NotificationContext]: System shutting down.");
  }, []);

  const addNotification = useCallback((message, type = 'info') => {
    const id = uuidv4(); 
    console.log(`📩 [NotificationContext]: New message queued (${type}):`, message);
    
    setNotifications((prev) => [...prev, { id, message, type }]);

    setTimeout(() => {
      setNotifications((current) => {
        const remaining = current.filter((n) => n.id !== id);
        console.log(`🗑️ [NotificationContext]: Expired notification removed. (${remaining.length} active)`);
        return remaining;
      });
    }, 5000);
  }, []); 

  const removeNotification = useCallback((id) => {
    setNotifications((current) => current.filter((n) => n.id !== id));
  }, []);

  const value = useMemo(() => ({
    notifications,
    addNotification,
    removeNotification,
  }), [notifications, addNotification, removeNotification]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
    </NotificationContext.Provider>
  );
};

export const useNotification = () => useContext(NotificationContext);