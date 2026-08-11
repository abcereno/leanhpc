import React, { useState, useEffect } from "react";
import { useClient } from "../../../hooks/useClient";
import { useCompanyAuth } from "../../../context/CompanyAuthContext";
import { useClientCreditFiles } from "../../../hooks/useClientCreditFiles";
import { Container, Spinner } from "react-bootstrap";
import { supabase } from "../../../supabaseClient";

// Import Sub-Components
import ProfileStep1 from "../steps/ProfileStep1";
import ProfileStep2 from "../steps/ProfileStep2";
import ProfileStep3 from "../steps/ProfileStep3";
import ProfileStep4 from "../steps/ProfileStep4"; 
import ProfileDashboard from "../steps/ProfileDashboard";

export default function IndividualClientProfile({ clientId }) {
  const { user } = useCompanyAuth();
  
  // Add a refresh key to force re-fetching the credit file after import
  const [creditRefresh, setCreditRefresh] = useState(0);

  // Data Hooks
  const { client, loading, refetch: refetchClient } = useClient(clientId);
  const { loading: loadingCredit, auditReport } = useClientCreditFiles(clientId, creditRefresh);

  // Stepper State
  const [step, setStep] = useState(0); 
  const [manualOverride, setManualOverride] = useState(false);

  // Determine Step Automatically (unless overridden)
  useEffect(() => {
    if (loading || loadingCredit) return;
    if (manualOverride) return;

    const checkSteps = async () => {
        // Step 1: Personal Info
        if (!client?.ssn || !client?.dob || !client?.address) {
            setStep(1); return;
        }

        // Step 2: Documents
        const { count } = await supabase
            .from('client_documents')
            .select('*', { count: 'exact', head: true })
            .eq('client_id', clientId);
        
        if ((count || 0) === 0) {
            setStep(2); return;
        }

        // Step 3: Credit Report
        if (!auditReport) {
            setStep(3); return;
        }

        // Step 4: User Agreement
        if (!client?.agreement_signed) {
            setStep(4); return;
        }

        // Step 5: Dashboard
        setStep(5);
    };

    checkSteps();
  }, [loading, loadingCredit, client, auditReport, clientId, manualOverride, creditRefresh]);

  // --- Handlers passed to children ---
  const onProfileSave = async () => {
      await refetchClient();
      setManualOverride(false); 
  };

  const onDocsUploaded = () => {
      refetchClient();
      setManualOverride(false);
  };

  const onImportComplete = () => {
      console.log("Import complete, refreshing data...");
      refetchClient(); 
      setCreditRefresh(prev => prev + 1); 
      setManualOverride(false);
  };

  const onAgreementSigned = () => {
      refetchClient();
      setManualOverride(true); 
      setStep(5); // Explicitly route to Dashboard
  };
  
  // [FIXED] Smart Skip Logic
  const onSkipImport = () => {
      setManualOverride(true); 
      // Check if they already signed the agreement previously
      if (client?.agreement_signed) {
          setStep(5); // Go straight to Dashboard
      } else {
          setStep(4); // Go to Agreement
      }
  };

  const onEditProfile = () => {
      setManualOverride(true);
      setStep(1);
  };

  const onBackToDocs = () => {
      setManualOverride(true);
      setStep(2);
  };

  const onCancelEdit = () => {
      setManualOverride(false);
      setStep(5); // Go back to Dashboard
  };

  // --- RENDER ---
  if (loading || loadingCredit || step === 0) {
    return (
      <Container className="d-flex flex-column justify-content-center align-items-center vh-100">
        <Spinner animation="border" variant="primary" />
        <p className="mt-3 text-muted">Loading your profile...</p>
      </Container>
    );
  }

  // Render specific step
  switch (step) {
      case 1:
          return (
            <ProfileStep1 
                client={client} 
                onSave={onProfileSave} 
                onCancel={manualOverride ? onCancelEdit : null} 
                clientId={clientId} 
            />
          );
      case 2:
          return (
            <ProfileStep2 
                clientId={clientId} 
                onNext={onDocsUploaded} 
                onBack={() => setStep(1)} 
            />
          );
      case 3:
          return (
            <ProfileStep3 
                clientId={clientId} 
                onComplete={onImportComplete} 
                onBack={() => setStep(2)}
                onSkip={onSkipImport} 
            />
          );
      case 4:
          return (
            <ProfileStep4 
                client={client}
                clientId={clientId}
                onComplete={onAgreementSigned} 
                onBack={() => setStep(3)}
            />
          );
      case 5:
          return (
            <ProfileDashboard 
                client={client} 
                clientId={clientId} 
                auditReport={auditReport}
                onEditProfile={onEditProfile}
                onManageDocs={onBackToDocs}
                user={user}
            />
          );
      default:
          return <div>Unknown Step</div>;
  }
}