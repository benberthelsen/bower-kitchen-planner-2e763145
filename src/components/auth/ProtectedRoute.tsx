import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requireAdmin?: boolean;
  requireUserType?: 'consumer' | 'trade';
}

function getUserTypeRedirectPath(requiredType: 'consumer' | 'trade'): string {
  return requiredType === 'trade' ? '/trade/dashboard' : '/consumer/dashboard';
}

export function ProtectedRoute({ children, requireAdmin = false, requireUserType }: ProtectedRouteProps) {
  const { user, loading, isAdmin, userType } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!loading) {
      if (!user) {
        // A scanner handoff must survive the sign-in detour. Keep only a
        // same-origin trade job path; the fragment capability stays in this
        // tab's session storage and is removed by the destination page.
        if (window.location.pathname.startsWith('/trade/job/')) {
          try {
            sessionStorage.setItem('bower.authReturnTo',
              window.location.pathname + window.location.search + window.location.hash);
          } catch { /* Sign-in still works when storage is unavailable. */ }
        }
        navigate('/auth');
      } else if (requireUserType && userType !== requireUserType) {
        // Temporary fail-open for canonical /trade/* flow to prevent auth redirect loops
        // when legacy consumer profiles access trade routes.
        if (!(requireUserType === 'trade' && userType === 'consumer')) {
          navigate(getUserTypeRedirectPath(requireUserType));
        }
      } else if (requireAdmin && !isAdmin) {
        navigate('/');
      }
    }
  }, [user, loading, isAdmin, requireAdmin, requireUserType, userType, navigate]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="h-8 w-8 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!user) return null;
  if (requireUserType && userType !== requireUserType && !(requireUserType === 'trade' && userType === 'consumer')) return null;
  if (requireAdmin && !isAdmin) return null;

  return <>{children}</>;
}
