import { useCallback, useEffect, useState } from "react";
import { supabase } from "../supabaseClient";

/**
 * Internal staff list (profiles table), same select shape as
 * AdminDirectory.jsx uses today. Used by Team Queue to build one row per
 * employee.
 */
export default function useStaffDirectory() {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error: err } = await supabase
        .from("profiles")
        .select("id, full_name, email, role, created_at, profile_picture_url")
        .order("full_name", { ascending: true });
      if (err) throw err;
      setStaff(data || []);
    } catch (e) {
      console.error("[useStaffDirectory] load error", e);
      setError(e.message || "Failed to load staff directory");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  return { staff, loading, error, reload };
}
