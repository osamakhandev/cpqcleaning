import { useEffect, useState, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { Loader2 } from 'lucide-react';

const PROJECT_ID_KEY = 'cpq-project-id';
const PRINT_DEBUG_KEY = 'cpq-print-debug-status';

function hydrateLocalStorage(blob: Record<string, Json>) {
  for (const [key, value] of Object.entries(blob)) {
    if (key.startsWith('cpq-') || key.startsWith('cpq_')) {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  }
}

function setPrintDebugStatus(status: Record<string, unknown>) {
  try {
    sessionStorage.setItem(PRINT_DEBUG_KEY, JSON.stringify(status));
  } catch {
    // Ignore sessionStorage failures in private mode or restricted contexts.
  }
}

/**
 * Gate component that ensures project data is hydrated into localStorage
 * BEFORE any downstream providers (RosterProvider, etc.) mount.
 */
export function ProjectHydrationGate({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const hydrate = async () => {
      const currentUrl = new URL(window.location.href);
      const payloadId = currentUrl.searchParams.get('payload');
      const projectIdFromUrl = currentUrl.searchParams.get('projectId');
      const isPrintRoute = currentUrl.pathname.startsWith('/print/');
      let storedId = localStorage.getItem(PROJECT_ID_KEY);
      let hydratedFromPayload = false;

      if (isPrintRoute) {
        setPrintDebugStatus({
          status: 'initializing',
          source: 'route',
          payloadId,
          projectId: projectIdFromUrl || storedId,
        });
      }

      if (payloadId) {
        try {
          const rawPayload = localStorage.getItem(`cpq-print-payload:${payloadId}`);
          if (rawPayload) {
            const parsedPayload = JSON.parse(rawPayload) as {
              projectId?: string;
              payload?: Record<string, Json>;
              createdAt?: number;
            };

            const payloadProjectId = parsedPayload.projectId || projectIdFromUrl || storedId;
            if (payloadProjectId) {
              localStorage.setItem(PROJECT_ID_KEY, payloadProjectId);
              storedId = payloadProjectId;
            }

            if (parsedPayload.payload && typeof parsedPayload.payload === 'object') {
              hydrateLocalStorage(parsedPayload.payload);
              hydratedFromPayload = true;
            }

            localStorage.removeItem(`cpq-print-payload:${payloadId}`);

            if (isPrintRoute) {
              setPrintDebugStatus({
                status: hydratedFromPayload ? 'payload-loaded' : 'payload-empty',
                source: 'payload',
                payloadId,
                projectId: payloadProjectId || null,
                createdAt: parsedPayload.createdAt ?? null,
              });
            }
          } else if (isPrintRoute) {
            setPrintDebugStatus({
              status: 'payload-missing',
              source: 'payload',
              payloadId,
              projectId: projectIdFromUrl || storedId,
            });
          }
        } catch (error) {
          console.error('Print payload hydration failed:', error);
          if (isPrintRoute) {
            setPrintDebugStatus({
              status: 'payload-error',
              source: 'payload',
              payloadId,
              projectId: projectIdFromUrl || storedId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      if (!hydratedFromPayload && projectIdFromUrl) {
        localStorage.setItem(PROJECT_ID_KEY, projectIdFromUrl);
        storedId = projectIdFromUrl;
      }

      if (!hydratedFromPayload && storedId) {
        try {
          const { data, error } = await supabase
            .from('projects')
            .select('data, status')
            .eq('id', storedId)
            .maybeSingle();

          if (!cancelled && data && !error) {
            const blob = data.data as Record<string, Json> | null;
            if (blob && typeof blob === 'object' && Object.keys(blob).length > 0) {
              hydrateLocalStorage(blob);
            }

            if ((data as { status?: string }).status) {
              localStorage.setItem('cpq-project-status', (data as { status?: string }).status as string);
            }

            if (isPrintRoute) {
              setPrintDebugStatus({
                status: blob && Object.keys(blob).length > 0 ? 'project-loaded' : 'project-empty',
                source: 'project',
                projectId: storedId,
              });
            }
          } else if (isPrintRoute) {
            setPrintDebugStatus({
              status: 'project-missing',
              source: 'project',
              projectId: storedId,
              error: error?.message ?? null,
            });
          }
        } catch (error) {
          console.error('Hydration fetch failed:', error);
          if (isPrintRoute) {
            setPrintDebugStatus({
              status: 'project-error',
              source: 'project',
              projectId: storedId,
              error: error instanceof Error ? error.message : String(error),
            });
          }
        }
      }

      if (isPrintRoute && !payloadId && !storedId) {
        setPrintDebugStatus({
          status: 'no-print-data',
          source: 'none',
          projectId: null,
        });
      }

      if (!cancelled) setReady(true);
    };

    hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3 text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
          <p className="text-sm font-medium">Loading project…</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
