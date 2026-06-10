import { useEffect, useRef, useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { CHRISTMAS_EXTENDED_TRADE_STORAGE_KEY } from '@/lib/christmasExtendedTradeStorage';

const PROJECT_ID_KEY = 'cpq-project-id';
const AUTOSAVE_DELAY = 3000; // 3 seconds debounce

// All localStorage keys that constitute project state
const CPQ_KEYS = [
  'cpq-roster-data',
  'cpq-scenarios',
  'cpq-active-scenario',
  'cpq-wage-settings',
  'cpq-service-colors',
  'cpq-job-details',
  'cpq-labour-assessment',
  'cpq-task-library',
  'cpq-divisions',
  'cpq-sundry-tables',
  'cpq-equipment-library',
  'cpq-equipment-major-rows',
  'cpq-equipment-minor-rows',
  'cpq-equipment-settings',
  'cpq-ph-state',
  'cpq_consumables_library',
  'cpq_consumables_rows',
  'cpq_consumables_profit',
  'cpq_periodical_rows',
  'cpq_sanitary_rows',
  'cpq_sanitary_markup',
  'cpq_peak_trading_rows',
  CHRISTMAS_EXTENDED_TRADE_STORAGE_KEY,
  'cpq_rental_value',
  'cpq_periodical_total',
  'cpq_osc_margin_total',
];

/** Collect all cpq-* localStorage keys into a single object */
function collectState(): Record<string, Json> {
  const blob: Record<string, Json> = {};
  for (const key of CPQ_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      try {
        blob[key] = JSON.parse(raw);
      } catch {
        blob[key] = raw;
      }
    }
  }
  return blob;
}

function mergeWithPersistedNonLocalState(current: Record<string, Json> | null | undefined, localState: Record<string, Json>): Record<string, Json> {
  const preserved = Object.fromEntries(
    Object.entries(current ?? {}).filter(([key]) => !key.startsWith('cpq-') && !key.startsWith('cpq_')),
  ) as Record<string, Json>;
  if (localState['cpq-labour-assessment'] !== undefined) {
    preserved['labour-assessment'] = localState['cpq-labour-assessment'];
  }
  return { ...preserved, ...localState };
}

/** Hydrate localStorage from a DB blob */
function hydrateState(blob: Record<string, Json>) {
  for (const [key, value] of Object.entries(blob)) {
    if (key.startsWith('cpq-') || key.startsWith('cpq_')) {
      localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  }
}

export function useProjectSync() {
  const [projectId, setProjectId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastHashRef = useRef<string>('');
  const projectIdRef = useRef<string | null>(null);

  // Derive project name from job details
  const getProjectName = useCallback(() => {
    try {
      const jd = JSON.parse(localStorage.getItem('cpq-job-details') || '{}');
      return jd.jobName || jd.jobBuildingName || 'New Project';
    } catch {
      return 'New Project';
    }
  }, []);

  // Save to Supabase (skip if project is submitted/locked)
  const saveNow = useCallback(async (force?: boolean) => {
    const id = projectIdRef.current;
    if (!id) return;

    // Don't autosave submitted projects
    const currentStatus = localStorage.getItem('cpq-project-status');
    if (currentStatus === 'submitted') return;

    const state = collectState();
    const hash = JSON.stringify(state);
    if (!force && hash === lastHashRef.current) return;

    setIsSaving(true);
    try {
      const { data: row } = await supabase
        .from('projects')
        .select('data')
        .eq('id', id)
        .single();
      const mergedState = mergeWithPersistedNonLocalState(row?.data as Record<string, Json> | null, state);
      const { error } = await supabase
        .from('projects')
        .update({ data: mergedState as Json, name: getProjectName() })
        .eq('id', id);

      if (!error) {
        lastHashRef.current = hash;
        setLastSaved(new Date());
      } else {
        console.error('Autosave error:', error);
        throw error;
      }
    } catch (e) {
      console.error('Autosave exception:', e);
      throw e;
    } finally {
      setIsSaving(false);
    }
  }, [getProjectName]);

  // Debounced save trigger — only schedule if no timer is already pending
  const scheduleSave = useCallback(() => {
    if (timerRef.current) return;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      saveNow();
    }, AUTOSAVE_DELAY);
  }, [saveNow]);

  // Initialize: set project ID and baseline hash (hydration already done by ProjectHydrationGate)
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const storedId = localStorage.getItem(PROJECT_ID_KEY);

      if (storedId) {
        // Data is already in localStorage (hydrated by ProjectHydrationGate).
        // Just verify the project exists in DB.
        const { data, error } = await supabase
          .from('projects')
          .select('id')
          .eq('id', storedId)
          .maybeSingle();

        if (!cancelled && data && !error) {
          projectIdRef.current = storedId;
          setProjectId(storedId);
          lastHashRef.current = JSON.stringify(collectState());
          setIsLoading(false);
          return;
        }
      }

      // No project ID or project not found — do NOT auto-create.
      // The AutoRedirect hook will send the user to /projects.
      if (!cancelled) {
        localStorage.removeItem(PROJECT_ID_KEY);
        setIsLoading(false);
      }
    };

    init();
    return () => { cancelled = true; };
  }, [getProjectName]);

  // Listen for localStorage changes and trigger autosave
  useEffect(() => {
    if (!projectId) return;

    const onStorage = (e: StorageEvent) => {
      if ((e.key?.startsWith('cpq-') || e.key?.startsWith('cpq_')) && e.key !== PROJECT_ID_KEY) {
        scheduleSave();
      }
    };
    window.addEventListener('storage', onStorage);

    // Poll for same-tab changes (localStorage doesn't fire storage events in same tab)
    const pollInterval = setInterval(() => {
      const current = JSON.stringify(collectState());
      if (current !== lastHashRef.current) {
        scheduleSave();
      }
    }, 2000);

    return () => {
      window.removeEventListener('storage', onStorage);
      clearInterval(pollInterval);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [projectId, scheduleSave]);

  // Warn user if leaving while save is in progress + flush on close
  useEffect(() => {
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      // Flush unsaved state via beacon
      if (projectIdRef.current) {
        const state = collectState();
        const hash = JSON.stringify(state);
        if (hash !== lastHashRef.current) {
          const url = `${import.meta.env.VITE_SUPABASE_URL}/rest/v1/projects?id=eq.${projectIdRef.current}`;
          const name = getProjectName();
          const body = JSON.stringify({ data: mergeWithPersistedNonLocalState(null, state), name });
          navigator.sendBeacon(url, new Blob([body], { type: 'application/json' }));
        }
      }
      // Warn if actively saving
      if (timerRef.current) {
        e.preventDefault();
        e.returnValue = 'Changes are still saving. Are you sure you want to leave?';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [getProjectName]);

  return { projectId, isSaving, lastSaved, isLoading, saveNow };
}
