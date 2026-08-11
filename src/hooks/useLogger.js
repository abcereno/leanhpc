import { useCallback } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "../context/AuthContext";

export default function useLogger() {
  const { user } = useAuth();

  const logAction = useCallback(async ({ action, targetId = null, targetName = null, details = "" }) => {
    if (!user) return;

    try {
      // 1. Try to fetch from Admin Profiles first
      let { data: profile } = await supabase
        .from("profiles")
        .select("full_name, role")
        .eq("id", user.id)
        .maybeSingle();

      // 2. If not found in profiles, check Company User Profiles
      if (!profile) {
        const { data: companyProfile } = await supabase
          .from("company_user_profiles")
          .select("full_name, role")
          .eq("id", user.id)
          .maybeSingle();
          
        profile = companyProfile;
      }

      // 3. Clean Identity: Use full_name if it exists, otherwise fallback to email
      const userName = profile?.full_name || user.email;
      const userRole = profile?.role || "user";

      // 4. Insert Log Entry
      const { error } = await supabase.from("activity_logs").insert({
        user_id: user.id,
        user_name: userName, // 👈 Now saves as just "Anthony" OR "anthony@email.com"
        user_role: userRole,
        action_type: action,
        target_id: targetId,
        target_name: targetName,
        details: details
      });

      if (error) console.error("Logger failed:", error.message);

    } catch (err) {
      console.error("Logger exception:", err);
    }
  }, [user]);

  return logAction;
}