'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { supabase } from '../supabase/client.ts';
import { initSyncListeners, processSyncQueue, pullAndHydrateFromRemote, reconcileOnSignIn } from '../sync/sync-service.ts';

export type SyncState = 'idle' | 'reconciling' | 'synced' | 'error';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isConfigured: boolean;
  syncState: SyncState;
  signInWithOtp: (email: string) => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  triggerReconciliation: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: false,
  isConfigured: false,
  syncState: 'idle',
  signInWithOtp: async () => ({ error: new Error('Supabase not configured') }),
  signOut: async () => {},
  triggerReconciliation: async () => {}
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncState, setSyncState] = useState<SyncState>('idle');
  const isConfigured = !!supabase;

  const triggerReconciliation = async () => {
    if (!session?.user) return;
    try {
      setSyncState('reconciling');
      await reconcileOnSignIn(session.user.id);
      setSyncState('synced');
    } catch (err) {
      console.warn('Manual reconciliation failed:', err);
      setSyncState('error');
    }
  };

  useEffect(() => {
    initSyncListeners();

    if (!supabase) {
      setLoading(false);
      return;
    }

    const handleSyncOnAuth = async (userId: string) => {
      try {
        setSyncState('reconciling');
        await reconcileOnSignIn(userId);
        setSyncState('synced');
      } catch (err) {
        console.warn('Auth sync reconciliation failed:', err);
        setSyncState('error');
      }
    };

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        handleSyncOnAuth(session.user.id);
      }
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
      if (session?.user) {
        handleSyncOnAuth(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signInWithOtp = async (email: string) => {
    if (!supabase) {
      return { error: new Error('Supabase credentials not configured in environment.') };
    }
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: typeof window !== 'undefined' ? window.location.origin : undefined
      }
    });
    return { error };
  };

  const signOut = async () => {
    if (supabase) {
      await supabase.auth.signOut();
    }
    setUser(null);
    setSession(null);
  };

  return (
    <AuthContext.Provider value={{ user, session, loading, isConfigured, signInWithOtp, signOut, syncState, triggerReconciliation }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
