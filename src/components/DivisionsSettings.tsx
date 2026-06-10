import { useState, useCallback, useSyncExternalStore, useEffect } from 'react';
import { Plus, Trash2, Settings2, FolderInput, Loader2 } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

const STORAGE_KEY = 'cpq-divisions';

// ── Shared external store so every useDivisions() consumer stays in sync ──

let divisionsCache: string[] | null = null;
const listeners = new Set<() => void>();

function notifyAll() {
  listeners.forEach((l) => l());
}

function getSnapshot(): string[] {
  if (divisionsCache === null) {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      divisionsCache = stored ? JSON.parse(stored) : [];
    } catch {
      divisionsCache = [];
    }
  }
  return divisionsCache;
}

function setDivisions(next: string[]) {
  divisionsCache = next;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  notifyAll();
}

/** Invalidate cache so useDivisions() re-reads from localStorage */
export function invalidateDivisionsCache() {
  divisionsCache = null;
  notifyAll();
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

// ── Public hook ──

export function useDivisions() {
  const divisions = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  const addDivision = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed || getSnapshot().includes(trimmed)) return;
    setDivisions([...getSnapshot(), trimmed]);
  }, []);

  const removeDivision = useCallback((name: string) => {
    setDivisions(getSnapshot().filter((d) => d !== name));
  }, []);

  const updateDivision = useCallback((oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    setDivisions(getSnapshot().map((d) => (d === oldName ? trimmed : d)));
  }, []);

  return { divisions, addDivision, removeDivision, updateDivision };
}

// ── Job picker for importing divisions ──

interface JobRow {
  id: string;
  name: string;
  folder: string | null;
}

function ImportFromJobDialog({ open, onOpenChange, currentDivisions }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentDivisions: string[];
}) {
  const [jobs, setJobs] = useState<JobRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedJob, setSelectedJob] = useState<JobRow | null>(null);
  const [preview, setPreview] = useState<{ all: string[]; newOnes: string[]; duplicates: string[] } | null>(null);
  const [importing, setImporting] = useState(false);

  const currentProjectId = localStorage.getItem('cpq-project-id');

  useEffect(() => {
    if (!open) {
      setSelectedJob(null);
      setPreview(null);
      return;
    }
    setLoading(true);
    supabase
      .from('projects')
      .select('id, name, folder')
      .order('updated_at', { ascending: false })
      .then(({ data }) => {
        const rows = (data as unknown as JobRow[]) || [];
        setJobs(rows.filter(j => j.id !== currentProjectId));
        setLoading(false);
      });
  }, [open, currentProjectId]);

  const handleSelectJob = async (job: JobRow) => {
    setSelectedJob(job);
    setImporting(true);
    const { data } = await supabase.from('projects').select('data').eq('id', job.id).single();
    setImporting(false);

    if (!data?.data) {
      toast.error('Could not read job data');
      return;
    }

    const jobData = data.data as Record<string, unknown>;
    const rawDivisions = jobData['cpq-divisions'];
    let sourceDivisions: string[] = [];

    if (typeof rawDivisions === 'string') {
      try { sourceDivisions = JSON.parse(rawDivisions); } catch { /* empty */ }
    } else if (Array.isArray(rawDivisions)) {
      sourceDivisions = rawDivisions.filter((d): d is string => typeof d === 'string');
    }

    const newOnes = sourceDivisions.filter(d => !currentDivisions.includes(d));
    const duplicates = sourceDivisions.filter(d => currentDivisions.includes(d));
    setPreview({ all: sourceDivisions, newOnes, duplicates });
  };

  const handleImport = () => {
    if (!preview || !selectedJob) return;
    const current = getSnapshot();
    const toAdd = preview.newOnes;
    if (toAdd.length > 0) {
      setDivisions([...current, ...toAdd]);
    }
    const msg = `${toAdd.length} division${toAdd.length !== 1 ? 's' : ''} imported from ${selectedJob.name}.${preview.duplicates.length > 0 ? ` ${preview.duplicates.length} duplicate${preview.duplicates.length !== 1 ? 's' : ''} skipped.` : ''}`;
    toast.success(msg);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Import Divisions from Job</DialogTitle>
          <DialogDescription>Select a job to import its division names into the current job.</DialogDescription>
        </DialogHeader>

        {!selectedJob ? (
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {loading ? (
              <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
            ) : jobs.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No other jobs found.</p>
            ) : (
              jobs.map(job => (
                <button
                  key={job.id}
                  className="w-full text-left px-3 py-2 rounded-md hover:bg-accent text-sm transition-colors"
                  onClick={() => handleSelectJob(job)}
                >
                  <span className="font-medium">{job.name}</span>
                  {job.folder && <span className="ml-2 text-xs text-muted-foreground">({job.folder})</span>}
                </button>
              ))
            )}
          </div>
        ) : importing ? (
          <div className="flex items-center justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
        ) : preview ? (
          <div className="space-y-3">
            <div className="text-sm">
              <p className="font-medium">{selectedJob.name}</p>
              <p className="text-muted-foreground">{preview.all.length} division{preview.all.length !== 1 ? 's' : ''} found</p>
            </div>

            {preview.newOnes.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Will import:</p>
                <div className="flex flex-wrap gap-1">
                  {preview.newOnes.map(d => (
                    <Badge key={d} variant="secondary" className="text-xs">{d}</Badge>
                  ))}
                </div>
              </div>
            )}

            {preview.duplicates.length > 0 && (
              <div>
                <p className="text-xs font-medium text-muted-foreground mb-1">Duplicates (will skip):</p>
                <div className="flex flex-wrap gap-1">
                  {preview.duplicates.map(d => (
                    <Badge key={d} variant="outline" className="text-xs opacity-60">{d}</Badge>
                  ))}
                </div>
              </div>
            )}

            {preview.newOnes.length === 0 && (
              <p className="text-sm text-muted-foreground">All divisions already exist. Nothing to import.</p>
            )}
          </div>
        ) : null}

        <DialogFooter>
          {selectedJob && !importing && (
            <>
              <Button variant="outline" size="sm" onClick={() => { setSelectedJob(null); setPreview(null); }}>
                Back
              </Button>
              <Button size="sm" onClick={handleImport} disabled={!preview || preview.newOnes.length === 0}>
                Import {preview ? preview.newOnes.length : 0} Division{preview?.newOnes.length !== 1 ? 's' : ''}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Settings UI ──

export function DivisionsSettings() {
  const { divisions, addDivision, removeDivision, updateDivision } = useDivisions();
  const [newName, setNewName] = useState('');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editValue, setEditValue] = useState('');
  const [importOpen, setImportOpen] = useState(false);

  const handleAdd = () => {
    if (newName.trim()) {
      addDivision(newName);
      setNewName('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleAdd();
  };

  return (
    <Collapsible>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4" />
              Divisions Settings
              {divisions.length > 0 && (
                <Badge variant="secondary" className="ml-2">{divisions.length}</Badge>
              )}
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-3 pt-0">
            <p className="text-sm text-muted-foreground">
              Define divisions (e.g., Zone A, Amenities, Carpark) used in operator and roster settings.
            </p>

            <div className="flex items-center gap-2">
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="New division name..."
                className="flex-1"
              />
              <Button size="sm" onClick={handleAdd} disabled={!newName.trim()}>
                <Plus className="h-4 w-4 mr-1" />
                Add
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={(e) => { e.stopPropagation(); setImportOpen(true); }}
              >
                <FolderInput className="h-4 w-4 mr-1" />
                Import from Job
              </Button>
            </div>

            {divisions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No divisions defined yet.</p>
            ) : (
              <div className="space-y-1">
                {divisions.map((div, idx) => (
                  <div key={idx} className="flex items-center gap-2 p-2 rounded-md border">
                    {editingIndex === idx ? (
                      <Input
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => { updateDivision(div, editValue); setEditingIndex(null); }}
                        onKeyDown={(e) => { if (e.key === 'Enter') { updateDivision(div, editValue); setEditingIndex(null); } }}
                        autoFocus
                        className="flex-1 h-7 text-sm"
                      />
                    ) : (
                      <span
                        className="flex-1 text-sm cursor-pointer hover:text-primary"
                        onClick={() => { setEditingIndex(idx); setEditValue(div); }}
                      >
                        {div}
                      </span>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeDivision(div)}>
                      <Trash2 className="h-3 w-3 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Card>

      <ImportFromJobDialog open={importOpen} onOpenChange={setImportOpen} currentDivisions={divisions} />
    </Collapsible>
  );
}
