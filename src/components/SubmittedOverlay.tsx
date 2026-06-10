import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Lock, Unlock, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useProjectStatus } from '@/contexts/ProjectStatusContext';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

const PROJECT_ID_KEY = 'cpq-project-id';

export function SubmittedBanner() {
  const { isLocked, unlockProject } = useProjectStatus();
  const navigate = useNavigate();
  const [showDialog, setShowDialog] = useState(false);
  const [duplicating, setDuplicating] = useState(false);

  if (!isLocked) return null;

  const handleDuplicate = async () => {
    setDuplicating(true);
    const id = localStorage.getItem(PROJECT_ID_KEY);
    if (!id) return;

    const { data: original } = await supabase
      .from('projects')
      .select('*')
      .eq('id', id)
      .single();

    if (!original) {
      toast.error('Could not duplicate project');
      setDuplicating(false);
      return;
    }

    const { data: newProj, error } = await supabase
      .from('projects')
      .insert({
        name: `${original.name} (Working Copy)`,
        data: original.data,
        status: 'active' as any,
      } as any)
      .select('id')
      .single();

    if (newProj && !error) {
      localStorage.setItem(PROJECT_ID_KEY, newProj.id);
      localStorage.setItem('cpq-project-status', 'active');
      toast.success('Duplicated as working copy');
      window.location.href = '/job-details';
    } else {
      toast.error('Duplication failed');
    }
    setDuplicating(false);
  };

  return (
    <>
      <div className="bg-amber-50 border border-amber-200 text-amber-800 px-4 py-2 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Lock className="h-4 w-4" />
          This project is <span className="font-bold">Submitted</span> and locked. Changes are not saved.
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-100"
            onClick={() => setShowDialog(true)}
          >
            <Unlock className="h-3.5 w-3.5" />
            Unlock
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs gap-1.5 border-amber-300 text-amber-800 hover:bg-amber-100"
            disabled={duplicating}
            onClick={handleDuplicate}
          >
            <Copy className="h-3.5 w-3.5" />
            Duplicate as Working Copy
          </Button>
        </div>
      </div>

      <AlertDialog open={showDialog} onOpenChange={setShowDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Unlock Submitted Project?</AlertDialogTitle>
            <AlertDialogDescription>
              This project was submitted and locked to preserve the exact pricing basis.
              Unlocking it will allow edits, and future changes to wage databases or defaults
              may alter the original submission values.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={unlockProject}>
              Unlock Project
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
