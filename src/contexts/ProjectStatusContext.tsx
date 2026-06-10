import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { toast } from 'sonner';
import { CHRISTMAS_EXTENDED_TRADE_STORAGE_KEY } from '@/lib/christmasExtendedTradeStorage';

export type ProjectStatus = 'draft' | 'active' | 'submitted';

interface ProjectStatusContextValue {
  status: ProjectStatus;
  setStatus: (s: ProjectStatus) => void;
  isLocked: boolean;
  submitProject: () => Promise<void>;
  unlockProject: () => Promise<void>;
}

const Ctx = createContext<ProjectStatusContextValue | null>(null);

export function useProjectStatus() {
  const val = useContext(Ctx);
  if (!val) throw new Error('useProjectStatus must be inside ProjectStatusProvider');
  return val;
}

const PROJECT_ID_KEY = 'cpq-project-id';
const STATUS_KEY = 'cpq-project-status';

// Collect project state for snapshot
const CPQ_KEYS = [
  'cpq-roster-data', 'cpq-scenarios', 'cpq-active-scenario', 'cpq-wage-settings',
  'cpq-service-colors', 'cpq-job-details', 'cpq-labour-assessment', 'cpq-task-library', 'cpq-divisions',
  'cpq-sundry-tables', 'cpq-equipment-library', 'cpq-equipment-major-rows',
  'cpq-equipment-minor-rows', 'cpq-equipment-settings', 'cpq-ph-state',
  'cpq_consumables_library', 'cpq_consumables_rows', 'cpq_consumables_profit',
  'cpq_periodical_rows', 'cpq_sanitary_rows', 'cpq_sanitary_markup',
  'cpq_peak_trading_rows', CHRISTMAS_EXTENDED_TRADE_STORAGE_KEY, 'cpq_rental_value',
  'cpq_periodical_total',
];

function collectState(): Record<string, Json> {
  const blob: Record<string, Json> = {};
  for (const key of CPQ_KEYS) {
    const raw = localStorage.getItem(key);
    if (raw !== null) {
      try { blob[key] = JSON.parse(raw); } catch { blob[key] = raw; }
    }
  }
  if (blob['cpq-labour-assessment'] !== undefined) {
    blob['labour-assessment'] = blob['cpq-labour-assessment'];
  }
  return blob;
}

export function ProjectStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatusState] = useState<ProjectStatus>(() => {
    return (localStorage.getItem(STATUS_KEY) as ProjectStatus) || 'draft';
  });

  const setStatus = useCallback((s: ProjectStatus) => {
    localStorage.setItem(STATUS_KEY, s);
    setStatusState(s);
  }, []);

  const isLocked = status === 'submitted';

  const submitProject = useCallback(async () => {
    const id = localStorage.getItem(PROJECT_ID_KEY);
    if (!id) return;

    const snapshot = collectState();
    const { error } = await supabase
      .from('projects')
      .update({
        status: 'submitted' as any,
        submitted_at: new Date().toISOString(),
        submitted_snapshot: snapshot as Json,
        data: snapshot as Json,
      } as any)
      .eq('id', id);

    if (!error) {
      setStatus('submitted');
      toast.success('Project submitted and locked');
    } else {
      toast.error('Failed to submit project');
      console.error(error);
    }
  }, [setStatus]);

  const unlockProject = useCallback(async () => {
    const id = localStorage.getItem(PROJECT_ID_KEY);
    if (!id) return;

    const { error } = await supabase
      .from('projects')
      .update({ status: 'active' as any } as any)
      .eq('id', id);

    if (!error) {
      setStatus('active');
      toast.success('Project unlocked — now editable');
    } else {
      toast.error('Failed to unlock project');
    }
  }, [setStatus]);

  return (
    <Ctx.Provider value={{ status, setStatus, isLocked, submitProject, unlockProject }}>
      {children}
    </Ctx.Provider>
  );
}
