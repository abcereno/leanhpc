import React from 'react';
import { Toast, ToastContainer } from 'react-bootstrap';
import { useNotification } from '../../../context/NotificationContext'; // <-- Use new context

export default function AppNotifier() {
  const { notifications, removeNotification } = useNotification();

  if (!notifications || notifications.length === 0) {
    return null;
  }

  return (
    <ToastContainer
      position="top-end"
      className="p-3"
      style={{ zIndex: 9999 }} // Ensure it's on top
    >
      {notifications.map((notification) => (
        <Toast
          key={notification.id}
          bg={notification.type === 'error' ? 'danger' : notification.type}
          onClose={() => removeNotification(notification.id)} // Allow manual closing
          delay={5000}
          autohide
        >
          <Toast.Header>
            <strong className="me-auto text-capitalize">
              {notification.type === 'success' && 'Success'}
              {notification.type === 'error' && 'Error'}
              {notification.type === 'info' && 'Info'}
              {notification.type === 'warning' && 'Warning'}
            </strong>
          </Toast.Header>
          <Toast.Body className={notification.type !== 'light' ? 'text-white' : ''}>
            {notification.message}
          </Toast.Body>
        </Toast>
      ))}
    </ToastContainer>
  );
}