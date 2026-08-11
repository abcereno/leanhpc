import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'sb.inquiry-counter.auth',
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
    // Keep your existing interval
    heartbeatIntervalMs: 5000, 
    
    // 👇 NEW: Resiliency settings to prevent silent disconnects in background tabs 👇
    worker: true, 
    heartbeatCallback: (status) => {
      // status: 'sent' | 'ok' | 'error' | 'timeout' | 'disconnected'
      if (status === 'timeout' || status === 'disconnected') {
        console.warn('🔄 Supabase Realtime heartbeat failed! Forcing reconnect...');
        supabase.realtime.connect();
      }
    },
  },
});