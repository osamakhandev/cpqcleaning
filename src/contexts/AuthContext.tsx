import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const NOT_APPROVED_MSG = 'Your account is not approved for access to CPQ';

function clearLocalCpqData() {
  Object.keys(localStorage).forEach((k) => {
    if (k.startsWith('cpq-') || k.startsWith('cpq_')) localStorage.removeItem(k);
  });
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const validatedFor = useRef<string | null>(null);

  useEffect(() => {
    // Validate the user against approved_users on every session change.
    // If not approved/active/expired -> sign out immediately.
    const validate = async (s: Session | null) => {
      if (!s?.user?.email) {
        validatedFor.current = null;
        return true;
      }
      // Avoid re-validating the same session repeatedly
      if (validatedFor.current === s.access_token) return true;

      try {
        const { data, error } = await supabase.rpc('activate_trial', {
          user_email: s.user.email,
        });
        const payload = (data ?? {}) as Record<string, unknown>;
        const denied =
          !!error ||
          !data ||
          typeof payload.error === 'string' ||
          payload.is_active !== true;

        if (denied) {
          validatedFor.current = null;
          await supabase.auth.signOut();
          clearLocalCpqData();
          setSession(null);
          toast.error(NOT_APPROVED_MSG);
          return false;
        }
        validatedFor.current = s.access_token;
        return true;
      } catch {
        validatedFor.current = null;
        await supabase.auth.signOut();
        clearLocalCpqData();
        setSession(null);
        toast.error(NOT_APPROVED_MSG);
        return false;
      }
    };

    // Set up listener FIRST
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setLoading(false);
      // Defer Supabase calls out of the callback
      if (newSession) setTimeout(() => { void validate(newSession); }, 0);
    });

    // Then check existing session
    supabase.auth.getSession().then(async ({ data: { session: existing } }) => {
      setSession(existing);
      setLoading(false);
      if (existing) { void validate(existing); }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
    clearLocalCpqData();
    window.location.href = '/auth';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm font-medium">Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={{ session, user: session?.user ?? null, loading, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
