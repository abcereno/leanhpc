import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { supabase } from "../supabaseClient";
import { useAuth } from "./AuthContext";

const CompanyAuthContext = createContext(null);

export const CompanyAuthProvider = ({ children }) => {
  const { user, loadingAuth, signOut: rootSignOut } = useAuth();
  
  const [companyId, setCompanyId] = useState(null);
  const [companyName, setCompanyName] = useState(null);
  const [companyLogoUrl, setCompanyLogoUrl] = useState(null);
  const [companyType, setCompanyType] = useState('standard');
  const [isSubscriptionActive, setIsSubscriptionActive] = useState(true);
  const [role, setRole] = useState(null);
  const [fullName, setFullName] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const clearState = useCallback(() => {
    setCompanyId(null);
    setCompanyName(null);
    setCompanyLogoUrl(null);
    setCompanyType('standard');
    setIsSubscriptionActive(true);
    setRole(null);
    setFullName(null);
    setError(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    let isMounted = true;

    if (loadingAuth) return;

    if (!user) {
      clearState();
      return;
    }

    const loadCompanyProfile = async () => {
      setLoading(true);
      setError(null);

      try {
        const { data, error: fetchError } = await supabase
          .from("company_user_profiles")
          .select("company_id, role, full_name, companies(company_name, company_type, is_subscription_active, logo_url)")
          .eq("id", user.id)
          .maybeSingle();

        if (fetchError) throw fetchError;

        if (isMounted) {
          if (data) {
            setCompanyId(data.company_id);
            setCompanyName(data.companies?.company_name);
            setCompanyLogoUrl(data.companies?.logo_url || null);
            setCompanyType(data.companies?.company_type || 'standard');
            // Defaults to true (unlocked) if the column is somehow null,
            // rather than locking out companies that predate this field.
            setIsSubscriptionActive(data.companies?.is_subscription_active ?? true);
            setRole(data.role);
            setFullName(data.full_name);
          } else {
            clearState();
          }
        }
      } catch (err) {
        console.error("Error loading company profile:", err.message);
        if (isMounted) setError(err.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    loadCompanyProfile();

    return () => {
      isMounted = false;
    };
  }, [user?.id, loadingAuth, clearState]);

  const value = useMemo(() => ({
    user,
    userId: user?.id,
    companyId,
    companyName,
    companyLogoUrl,
    companyType,
    isSubscriptionActive,
    role,
    fullName,
    loading: loading || loadingAuth,
    error,
    isAgent: role === 'agent',
    isCompanyAdmin: role === 'company_admin' || role === 'company_owner'|| role === 'admin',
    signOut: rootSignOut
  }), [user, companyId, companyName, companyLogoUrl, companyType, isSubscriptionActive, role, fullName, loading, loadingAuth, error, rootSignOut]);

  return (
    <CompanyAuthContext.Provider value={value}>
      {children}
    </CompanyAuthContext.Provider>
  );
};

export const useCompanyAuth = () => {
  const context = useContext(CompanyAuthContext);
  if (context === undefined) {
    throw new Error("useCompanyAuth must be used within a CompanyAuthProvider");
  }
  return context;
};