import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase } from '../supabaseClient';

const AffiliateAuthContext = createContext();

export const AffiliateAuthProvider = ({ children }) => {
  const [affiliate, setAffiliate] = useState(null);
  const [loading, setLoading] = useState(true);

  const signOut = useCallback(async () => {
    setLoading(true);
    await supabase.auth.signOut();
    setAffiliate(null);
    setLoading(false);
    // Hard refresh to login prevents weird nested router loops
    window.location.href = '/login'; 
  }, []);

  useEffect(() => {
    let isMounted = true;

    const checkUser = async (session) => {
      const incomingUser = session?.user ?? null;

      if (!incomingUser) {
        if (isMounted) {
          setAffiliate(null);
          setLoading(false);
        }
        return;
      }

      try {
        const { data, error } = await supabase
          .from('affiliates')
          .select('*')
          .eq('auth_user_id', incomingUser.id)
          .maybeSingle();

        if (error) throw error;

        if (isMounted) setAffiliate(data || null);
      } catch (error) {
        console.error("Affiliate context suppressed error:", error.message);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => checkUser(session));

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        if (isMounted) {
          setAffiliate(null);
          setLoading(false);
        }
      } else {
        checkUser(session);
      }
    });

    return () => {
      isMounted = false;
      listener.subscription.unsubscribe();
    };
  }, []); // 🔥 CRITICAL FIX: Removed routing dependencies!

  return (
    <AffiliateAuthContext.Provider value={{ affiliate, affiliateId: affiliate?.id, loading, signOut }}>
      {children}
    </AffiliateAuthContext.Provider>
  );
};

export const useAffiliateAuth = () => useContext(AffiliateAuthContext);