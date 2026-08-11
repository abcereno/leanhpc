import React, { useEffect, useState } from "react";
import { supabase } from "../../supabaseClient";
import { Spinner, Container, Alert } from "react-bootstrap";
import IndividualClientProfile from "./sidebars/IndividualClientProfile";
import ClientAuditPage from "../shared/client-pages/ClientAuditPage";
import { useToast } from "../shared/ui/ToastNotifier";
import { deriveServiceId } from "../../utils/services";

export default function IndividualDashboard() {
  const { addToast } = useToast();
  const [myClientId, setMyClientId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const init = async () => {
      try {
        setLoading(true);

        // 1. Get Logged In User
        const { data: { user: authUser } } = await supabase.auth.getUser();
        
        if (!authUser) {
             setLoading(false);
             return;
        }

        // 2 & 3. Find every clients row that could belong to this person —
        // ones already linked to their auth account, PLUS any unlinked row
        // sharing their email (the self-healing link, for a row created by
        // staff that hasn't been claimed yet). A returning client gets a
        // NEW clients row per round (see utils/clientDuplicateRound.js), so
        // picking "the" match by auth_user_id alone would permanently stick
        // the portal on whichever round happened to get linked first —
        // instead, gather all candidates and always resolve to the most
        // recent round.
        let [{ data: linkedRows, error: linkedErr }, { data: unlinkedRows, error: unlinkedErr }] = await Promise.all([
            supabase.from("clients").select("id, dispute_round, auth_user_id").eq("auth_user_id", authUser.id),
            supabase.from("clients").select("id, dispute_round, auth_user_id").ilike("email", authUser.email).is("auth_user_id", null),
        ]);

        // sql/add_dispute_round.sql may not have been run yet on this
        // database — don't let a missing optional column lock every client
        // out of their portal. Fall back to the pre-round lookup (no
        // dispute_round in the select) if that's the cause of the error.
        const isMissingDisputeRound = (err) => err && /dispute_round/i.test(err.message || "");
        if (isMissingDisputeRound(linkedErr) || isMissingDisputeRound(unlinkedErr)) {
            console.warn("clients.dispute_round not found (run sql/add_dispute_round.sql) — falling back without it.");
            [{ data: linkedRows, error: linkedErr }, { data: unlinkedRows, error: unlinkedErr }] = await Promise.all([
                supabase.from("clients").select("id, auth_user_id").eq("auth_user_id", authUser.id),
                supabase.from("clients").select("id, auth_user_id").ilike("email", authUser.email).is("auth_user_id", null),
            ]);
        }

        if (linkedErr) throw linkedErr;
        if (unlinkedErr) throw unlinkedErr;

        const candidates = [...(linkedRows || []), ...(unlinkedRows || [])];
        candidates.sort((a, b) => (b.dispute_round || 1) - (a.dispute_round || 1));

        let targetClient = candidates[0] || null;

        if (targetClient && !targetClient.auth_user_id) {
            console.log("Found unlinked client profile (latest round)! Linking now...");

            const { data: linkedClient, error: linkError } = await supabase
                .from("clients")
                .update({ auth_user_id: authUser.id })
                .eq("id", targetClient.id)
                .select("id")
                .single();

            if (linkError) throw linkError;
            targetClient = linkedClient;
        }

        // 4. CREATE NEW: If STILL no profile exists, create one from scratch
        if (!targetClient) {
            console.log("No client profile found at all. Creating new one...");
            
            const newClientPayload = {
                full_name: authUser.user_metadata?.full_name || authUser.email,
                email: authUser.email,
                dispute_method: 'inquiry deletion',
                service_id: deriveServiceId('inquiry deletion'),
                status: 'active',
                auth_user_id: authUser.id
            };
            let { data: newClient, error: createError } = await supabase
                .from("clients")
                .insert(newClientPayload)
                .select("id")
                .single();

            // Defensive: sql/add_services.sql may not have been run yet — degrade
            // gracefully rather than blocking first-login onboarding.
            if (createError && /service_id/i.test(createError.message || "")) {
                const { service_id: _omit, ...withoutServiceId } = newClientPayload;
                ({ data: newClient, error: createError } = await supabase
                    .from("clients")
                    .insert(withoutServiceId)
                    .select("id")
                    .single());
            }

            if (createError) throw createError;
            targetClient = newClient;
        }

        if (targetClient) {
            // --- 🟢 STRIPE REDIRECT CATCHER STARTS HERE 🟢 ---
            const query = new URLSearchParams(window.location.search);
            const isSuccess = query.get("success");
            const type = query.get("type"); // 👈 FIX: Look for 'type' instead of 'invoice_id'

            // If Stripe sent them back here with a success message for a direct purchase
            if (isSuccess && type) {
                if (type === 'vault' || type === 'classroom') {
                    // 🔓 Unlock the vault in the database!
                    await supabase
                        .from('clients')
                        .update({ has_education_vault: true })
                        .eq('id', targetClient.id);
                    
                    addToast({ title: "Payment Successful", message: "Your App Vault is now unlocked.", variant: "success", icon: "bi-unlock-fill" });
                }

                // Erase the ?success=true from the URL so it doesn't run again if they refresh
                window.history.replaceState(null, '', window.location.pathname);
            }
            // --- 🔴 STRIPE REDIRECT CATCHER ENDS HERE 🔴 ---

            // Finally, set the ID so the rest of the portal can load
            setMyClientId(targetClient.id);
        }
        
      } catch (err) {
        console.error("Error loading individual profile:", err);
        setError(`We couldn't load or create your profile. (${err.message})`);
      } finally {
        setLoading(false);
      }
    };

    init();
  }, []);

  if (loading) {
    return (
      <div className="d-flex flex-column justify-content-center align-items-center" style={{ minHeight: '60vh' }}>
        <Spinner animation="border" variant="primary" />
        <p className="ms-3 mb-0 text-muted">Loading your dashboard...</p>
      </div>
    );
  }

  if (error) {
      return (
          <Container className="mt-5">
              <Alert variant="danger">{error}</Alert>
          </Container>
      );
  }

  if (!myClientId) {
      return (
          <Container className="mt-5 text-center">
              <Alert variant="info">
                  <h4>Welcome!</h4>
                  <p>We are setting up your file. Please refresh the page in a few moments.</p>
              </Alert>
          </Container>
      );
  }

  // Otherwise (default), show the standard IndividualClientProfile
  return <IndividualClientProfile clientId={myClientId} />;
}