import { useEffect } from "react";
import { supabase } from "../../supabaseClient";
import { useToast } from "../shared/ui/ToastNotifier"; 
import { useAuth } from "../../context/AuthContext";
import { useLocation } from "react-router-dom"; // 👈 NEW: Import useLocation

export default function AdminNotificationWatcher() {
  const { addToast } = useToast();
  const { user, hasAnyPermission } = useAuth();
  // Permission-based (utils/permissions.js): watches for document/payment
  // notifications, so gate on whoever can act on either.
  const canReceiveNotifications = hasAnyPermission(["view_documents", "view_payments"]);
  const location = useLocation(); // 👈 NEW: Get the current page URL

  useEffect(() => {
    // 👇 NEW: Check if the current URL belongs to a public funnel
    const path = location.pathname.toLowerCase();
    const isFunnelPage = path.includes('/funnel') || path.includes('/partner') || path.includes('/lead');

    // If on a funnel page OR not an authorized admin, stop immediately!
    if (isFunnelPage || !user || !canReceiveNotifications) return;

    // 1. Create a unique channel name so React rendering doesn't cause collisions
    const channelName = `admin-notifs-${user.id}-${Date.now()}`;

    // 2. Combine all listeners onto a single, uniquely named channel
    const notifChannel = supabase.channel(channelName)
      
      // --- LISTENER A: NEW CLIENT ADDED ---
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'clients' },
        (payload) => {
          const clientName = payload.new.full_name || 'A new client';
          
          // Ignore Quick Imports that haven't been finalized yet
          if (!clientName.includes("QUICK IMPORT")) {
            addToast({
              title: "New Client Added",
              message: `${clientName} just entered the system.`,
              variant: "success",
              icon: "bi-person-plus-fill",
              timeout: 8000,
              sound: "/sounds/notification.mp3" 
            });
          }
        }
      )

      // --- LISTENER B: DOCUMENT UPLOADS ---
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'client_documents' },
        async (payload) => {
          let clientName = "A client";
          
          // Rapid lookup to find out WHO uploaded the document
          if (payload.new.client_id) {
            const { data } = await supabase
              .from('clients')
              .select('full_name')
              .eq('id', payload.new.client_id)
              .single();
            if (data) clientName = data.full_name;
          }

          addToast({
            title: "New Document Uploaded",
            message: `${clientName} just uploaded: ${payload.new.file_name}`,
            variant: "info",
            icon: "bi-file-earmark-arrow-up-fill",
            timeout: 8000,
            sound: "/sounds/docs.mp3" 
          });
        }
      )

      // --- LISTENER B2: DOCUMENT VALIDITY ISSUES (AI check) ---
      // Fires the moment CoverLetterAssets.jsx's validate-document call
      // (or a manual "Check Validity" recheck) writes back a bad status —
      // this is the "make sure we don't miss it" alert for an expired,
      // invalid, or unclear license/SSN card/POA, on top of the badges in
      // ProductionQueue.jsx and ClientHeader.jsx (which only show up once
      // someone's already looking at that client). Only fires when the
      // status actually changed into a flagged one, not on every
      // unrelated row update.
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'client_documents' },
        async (payload) => {
          const flaggedStatuses = ['expired', 'invalid', 'needs_review'];
          const newStatus = payload.new?.validation_status;
          const oldStatus = payload.old?.validation_status;
          if (!flaggedStatuses.includes(newStatus) || newStatus === oldStatus) return;

          const docLabels = { license: "Driver's License", ssn: "SSN Card", poa: "Proof of Address" };
          const statusLabels = { expired: "Expired", invalid: "Invalid", needs_review: "Needs Review" };
          const docLabel = docLabels[payload.new.file_name] || payload.new.file_name;

          let clientName = "A client";
          if (payload.new.client_id) {
            const { data } = await supabase
              .from('clients')
              .select('full_name')
              .eq('id', payload.new.client_id)
              .single();
            if (data) clientName = data.full_name;
          }

          addToast({
            title: `Document ${statusLabels[newStatus] || newStatus}`,
            message: `${clientName}'s ${docLabel} was flagged: ${payload.new.validation_notes || "see Cover Letter Assets on the client's profile."}`,
            variant: "warning",
            icon: "bi-file-earmark-excel-fill",
            timeout: 10000,
            sound: "/sounds/docs.mp3"
          });
        }
      )

      // --- LISTENER C: CLIENT STATUS CHANGES (Payments & Completed Docs) ---
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'clients' },
        (payload) => {
          
          // Payment Check
          if (payload.new.is_paid === true && payload.old?.is_paid === false) {
            addToast({
              title: "Payment Received!",
              message: `${payload.new.full_name} has been marked as paid.`,
              variant: "success",
              icon: "bi-currency-dollar",
              timeout: 8000,
              sound: "/sounds/paid.mp3" 
            });
          }

          // All Documents Completed Check
          if (payload.new.is_uploaded === true && payload.old?.is_uploaded === false) {
            addToast({
              title: "Documents Completed!",
              message: `${payload.new.full_name} has uploaded all required ID documents.`,
              variant: "primary", 
              icon: "bi-folder-check",
              timeout: 10000, 
              sound: "/sounds/docs.mp3" 
            });
          }

        }
      )
      
      // --- EXECUTE THE SUBSCRIPTION ---
      .subscribe();

    return () => {
      // Clean up the channel perfectly when you leave the page
      supabase.removeChannel(notifChannel);
    };
  }, [user, canReceiveNotifications, addToast, location.pathname]); // 👈 Added location.pathname to dependencies

  return null; 
}