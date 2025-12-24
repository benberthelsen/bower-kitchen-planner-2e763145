import { useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';

export type AppRole = 'admin' | 'moderator' | 'user';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  userRole: AppRole | null;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    isAdmin: false,
    userRole: null,
  });

  useEffect(() => {
    // Set up auth state listener FIRST
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      // If we have a user, we keep loading=true until role lookup completes.
      // This prevents ProtectedRoute from redirecting before isAdmin is known.
      setAuthState((prev) => ({
        ...prev,
        session,
        user: session?.user ?? null,
        loading: Boolean(session?.user),
      }));

      // Defer role check with setTimeout to avoid deadlock
      if (session?.user) {
        setTimeout(() => {
          checkUserRole(session.user.id);
        }, 0);
      } else {
        setAuthState((prev) => ({
          ...prev,
          isAdmin: false,
          userRole: null,
          loading: false,
        }));
      }
    });

    // THEN check for existing session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthState((prev) => ({
        ...prev,
        session,
        user: session?.user ?? null,
        loading: Boolean(session?.user),
      }));

      if (session?.user) {
        checkUserRole(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUserRole = async (userId: string) => {
    // Keep loading true until we definitively know the role.
    setAuthState((prev) => ({ ...prev, loading: true }));

    try {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

      // No role row found => normal user
      if (error?.code === 'PGRST116') {
        setAuthState((prev) => ({
          ...prev,
          isAdmin: false,
          userRole: null,
          loading: false,
        }));
        return;
      }

      if (error) {
        console.error('Error checking user role:', error);
        setAuthState((prev) => ({ ...prev, loading: false }));
        return;
      }

      const role = (data?.role as AppRole | null) ?? null;
      setAuthState((prev) => ({
        ...prev,
        isAdmin: role === 'admin',
        userRole: role,
        loading: false,
      }));
    } catch (error) {
      console.error('Error checking user role:', error);
      setAuthState((prev) => ({ ...prev, loading: false }));
    }
  };

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error };
  }, []);

  const signUp = useCallback(async (email: string, password: string, fullName?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: { full_name: fullName }
      }
    });
    return { error };
  }, []);

  const signOut = useCallback(async () => {
    const { error } = await supabase.auth.signOut();
    return { error };
  }, []);

  return {
    ...authState,
    signIn,
    signUp,
    signOut,
  };
}