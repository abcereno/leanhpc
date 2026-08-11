import { useState } from 'react';

/**
 * Custom hook to manage the UI state and interactions for the ClientProfile page.
 */
export function useClientProfilePage() {
  // State for controlling the visibility of the Edit Client modal
  const [isEditModalOpen, setEditModalOpen] = useState(false);

  // State for controlling the visibility of the Reminders sidebar
  const [isRemindersSidebarOpen, setRemindersSidebarOpen] = useState(false);

  // State to hold signed URLs for documents needed by the cover letter
  // e.g., { licenseUrl, ssnUrl, poaUrl }
  const [letterAssets, setLetterAssets] = useState({});

  // Memoized handlers to prevent unnecessary re-renders in child components
  const openEditModal = () => setEditModalOpen(true);
  const closeEditModal = () => setEditModalOpen(false);

  const openReminders = () => setRemindersSidebarOpen(true);
  const closeReminders = () => setRemindersSidebarOpen(false);

  // Return all the state and functions needed by the component
  return {
    isEditModalOpen,
    isRemindersSidebarOpen,
    letterAssets,
    setLetterAssets,
    openEditModal,
    closeEditModal,
    openReminders,
    closeReminders,
  };
}