import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useRef,
} from "react";
import { supabase } from "../supabaseClient";
import { hasPermission as checkPermission, hasAnyPermission, hasAllPermissions } from "../utils/permissions";

const AuthContext = createContext(null);

/**
 * Normalizes various string inputs into standard system roles.
 */
const normalizeRole = (r) => {
  const s = String(r || "").trim().toLowerCase();
  
  if (["owner", "owners"].includes(s)) return "owner";
  if (["admin", "admins"].includes(s)) return "admin";
  if (["subadmin", "sub_admin", "sub-admin"].includes(s)) return "subadmin";
  if (["supervisor", "supervisors", "sup"].includes(s)) return "supervisor";
  if (s.includes("dev")) return "developer";
  if (["customer_service", "customer service", "cs"].includes(s)) return "customer_service";
  if (["caller", "callers"].includes(s)) return "caller";
  if (["counter", "counters"].includes(s)) return "counter";
  if (["callcount", "call_count", "call-count"].includes(s)) return "callcount";
  
  return s || null;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [role, setRole] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [profileData, setProfileData] = useState(null);
  const [loading, setLoading] = useState(true);

  // Track when the fetch is ACTUALLY finished
  const completedFetchForUserId = useRef(null);

  // sql/add_permissions.sql may not have been run yet on this database — if
  // it hasn't, `permissions` doesn't exist as a column and selecting it
  // throws, which would otherwise take down the ENTIRE profile fetch (role
  // included). Same defensive-retry pattern used for clients.dispute_round
  // and clients.counted_at this same migration cycle: try with it, drop it
  // and retry once if that's specifically what the DB rejected.
  //
  // Deliberately NOT remembered across fetches (no useRef "give up
  // forever" flag here, unlike the dispute_round/counted_at versions of
  // this pattern) — this one bit a real user: the column didn't exist yet
  // on their first fetch this session, so it fell back once and then kept
  // falling back for the rest of the browser tab's lifetime even after the
  // migration was run, because nothing ever re-attempted the full select.
  // Always attempting fresh means running the migration mid-session is
  // picked up on the very next profile fetch instead of requiring a hard
  // reload.

  const clearAppState = () => {
    setUser(null);
    setRole(null);
    setPermissions({});
    setProfileData(null);
    setLoading(false);
    completedFetchForUserId.current = null;
  };

  useEffect(() => {
    let isMounted = true;

    const handleSession = async (session) => {
      const incomingUser = session?.user ?? null;

      if (!incomingUser) {
        if (isMounted) clearAppState();
        return;
      }

      if (isMounted) {
        // Supabase hands us a brand-new `session.user` object on EVERY auth
        // event, including a silent TOKEN_REFRESHED — which fires whenever
        // the browser tab regains focus, not just on real login/logout.
        // Blindly calling setUser(incomingUser) here churns the object
        // identity even when nothing about the user actually changed, and
        // that churn cascades: CompanyAuthContext's memoized `value`
        // depends on `user`, so it recomputes too, and any downstream
        // component with `user` (or a context object built from it) in a
        // useEffect dependency array sees a "changed" dependency and
        // re-runs — which is exactly what was silently clearing partially
        // filled-out forms just from switching browser tabs and back. Keep
        // the previous object reference when the user hasn't meaningfully
        // changed (same id + same updated_at) so unrelated consumers don't
        // see a false change.
        setUser((prev) =>
          prev && prev.id === incomingUser.id && prev.updated_at === incomingUser.updated_at
            ? prev
            : incomingUser
        );
      }

      // Check if we already fetched data for this exact user
      if (incomingUser.id === completedFetchForUserId.current) {
        if (isMounted) setLoading(false);
        return;
      }

      if (isMounted) setLoading(true);

      try {
        const baseFields = "id, role, full_name, email";

        let { data, error } = await supabase
          .from("profiles")
          .select(`${baseFields}, permissions`)
          .eq("id", incomingUser.id)
          .maybeSingle();

        if (error && /permissions/i.test(error.message || "")) {
          console.warn("profiles.permissions not found (run sql/add_permissions.sql) — falling back without it this fetch.");
          ({ data, error } = await supabase
            .from("profiles")
            .select(baseFields)
            .eq("id", incomingUser.id)
            .maybeSingle());
        }

        if (!isMounted) {
          console.warn("⚠️ [AuthContext] Fetch completed, but component unmounted. Discarding results.");
          return;
        }

        if (error) {
          console.error("❌ [AuthContext] Supabase fetch error:", error.message);
          throw error;
        }

        if (data) {
          const normalized = normalizeRole(data.role);
          setRole(normalized);
          setPermissions(data.permissions || {});
          setProfileData(data);
        } else {
          setRole(null);
          setPermissions({});
          setProfileData(null);
        }
        
        // Mark the fetch as fully resolved
        completedFetchForUserId.current = incomingUser.id;

      } catch (err) {
        console.error("❌ [AuthContext] Critical failure during profile fetch:", err);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    // 1. Initial session check on mount
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleSession(session);
    });

    // 2. Listen for auth changes (Login, Logout, Token Refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        if (isMounted) clearAppState();
      } else {
        handleSession(session);
      }
    });

    return () => {
      isMounted = false;
      subscription?.unsubscribe();
    };
  }, []);

  const value = useMemo(() => {
    const roleNorm = role;
    
    const displayName = profileData?.full_name || user?.user_metadata?.full_name || "";

    return {
      user,
      userId: user?.id,
      role: roleNorm,
      permissions,
      // Permission-based access — replaces the role booleans below as the
      // long-term source of truth. See utils/permissions.js for valid keys.
      hasPermission: (key) => checkPermission(permissions, key),
      hasAnyPermission: (keys) => hasAnyPermission(permissions, keys),
      hasAllPermissions: (keys) => hasAllPermissions(permissions, keys),
      fullName: displayName,
      // Alias of fullName — several components (InquiriesThread.jsx,
      // UploadReportForm.jsx, SmartIdiQModal.jsx, Fetch3bModal.jsx,
      // ParseRreportModal.jsx, CreditAuditLayout.jsx) destructure `adminName`
      // from useAuth() expecting the current staff member's display name
      // for the `clients.counter` column. It was never actually exposed
      // here, so it was always `undefined` at every one of those call
      // sites — Supabase silently drops `undefined` values from an
      // update payload, so `counter` never got set via those paths.
      adminName: displayName,
      loadingAuth: loading,
      isAuthenticated: !!user,

      // isDeveloper is the one role-based flag that survives the permission
      // cutover: it's an account-type/UI-mode switch (puts AdminSidebar/
      // AdminProfile into the stripped-down engineering view), not an
      // access-scope permission. Every other former role boolean
      // (isOwner/isAdmin/isCaller/etc.) has been replaced by
      // hasPermission()/hasAnyPermission() above — see utils/permissions.js.
      isDeveloper: roleNorm === "developer",

      signOut: async () => {
        setLoading(true);
        try {
          await supabase.auth.signOut();
          Object.keys(localStorage).forEach(key => {
            if (key.startsWith('sb')) localStorage.removeItem(key);
          });
          clearAppState();
        } catch (err) {
          console.error("❌ [AuthContext] Sign out error:", err);
        } finally {
          setLoading(false);
        }
      }
    };
  }, [user, role, permissions, profileData, loading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used within an AuthProvider");
  return context;
};