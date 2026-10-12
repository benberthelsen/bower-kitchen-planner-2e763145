import { useState, useEffect, useCallback } from 'react';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { type AppRole, resolveRoles } from '@/lib/authRoles';

export type { AppRole };
export type UserType = 'consumer' | 'trade';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAdmin: boolean;
  /** Admin-approved trade account (trade_accounts). Not the same as
   *  userType, which the person picks at sign-up. Grants nothing yet. */
  isTrade: boolean;
  roles: AppRole[];
  userRole: AppRole | null;
  userType: UserType;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    isAdmin: false,
    isTrade: false,
    roles: [],
    userRole: null,
    userType: 'consumer',
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
          checkUserRoleAndType(session.user.id);
        }, 0);
      } else {
        setAuthState((prev) => ({
          ...prev,
          isAdmin: false,
          isTrade: false,
          roles: [],
          userRole: null,
          userType: 'consumer',
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
        checkUserRoleAndType(session.user.id);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const checkUserRoleAndType = async (userId: string) => {
    // Keep loading true until we definitively know the role.
    setAuthState((prev) => ({ ...prev, loading: true }));

    try {
      // Fetch roles, profile and trade approval in parallel. Every role row
      // is read: .single() failed for an account with two roles.
      const [roleResult, profileResult, tradeResult] = await Promise.all([
        supabase
          .from('user_roles')
          .select('role')
          .eq('user_id', userId),
        supabase
          .from('profiles')
          .select('user_type')
          .eq('id', userId)
          .single(),
        // RLS returns only the caller's own row. trade_accounts is newer than
        // the generated types.
        (supabase as any)
          .from('trade_accounts')
          .select('user_id')
          .eq('user_id', userId)
          .maybeSingle(),
      ]);

      const { roles, isAdmin, userRole } = resolveRoles(roleResult.error ? [] : roleResult.data);
      const isTrade = !tradeResult.error && Boolean(tradeResult.data);
      let userType: UserType = 'consumer';

      // Handle profile result
      if (!profileResult.error && profileResult.data?.user_type) {
        userType = profileResult.data.user_type as UserType;
      }

      setAuthState((prev) => ({
        ...prev,
        isAdmin,
        isTrade,
        roles,
        userRole,
        userType,
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