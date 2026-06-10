import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Plus, FolderOpen, Loader2, MoreVertical, Copy, Pencil, Trash2, Check, X, ArrowLeft, Lock, Unlock, Send, Download, Upload, FolderInput, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import cpqLogo from '@/assets/cpq-logo.png';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';
import {
  CHRISTMAS_EXTENDED_TRADE_STORAGE_KEY,
  LEGACY_CHRISTMAS_EXTENDED_TRADE_STORAGE_KEYS,
} from '@/lib/christmasExtendedTradeStorage';
import { useAuth } from '@/contexts/AuthContext';
import { LogOut, User as UserIcon } from 'lucide-react';

const PROJECT_ID_KEY = 'cpq-project-id';
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

type ProjectStatus = 'draft' | 'active' | 'submitted';

interface ProjectRow {
  id: string;
  name: string;
  status: ProjectStatus;
  created_at: string;
  updated_at: string;
  submitted_at: string | null;
  folder: string | null;
}

const STATUS_CONFIG: Record<ProjectStatus, { label: string; variant: 'default' | 'secondary' | 'outline' | 'destructive'; className: string }> = {
  draft: { label: 'Draft', variant: 'secondary', className: '' },
  active: { label: 'Active', variant: 'default', className: '' },
  submitted: { label: 'Submitted', variant: 'outline', className: 'border-amber-400 text-amber-700 bg-amber-50' },
};

export default function Projects() {
  const { user, signOut } = useAuth();
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProjectRow | null>(null);
  const [submitTarget, setSubmitTarget] = useState<ProjectRow | null>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [importsOpen, setImportsOpen] = useState(true);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchProjects = async () => {
    // RLS already enforces owner_id = auth.uid(), but we filter explicitly for clarity
    const { data } = await supabase
      .from('projects')
      .select('id, name, created_at, updated_at, status, submitted_at, folder')
      .order('updated_at', { ascending: false });
    setProjects((data as unknown as ProjectRow[]) || []);
    setLoading(false);
  };

  useEffect(() => { fetchProjects(); }, []);

  const clearLocalState = () => {
    CPQ_KEYS.forEach(k => localStorage.removeItem(k));
    LEGACY_CHRISTMAS_EXTENDED_TRADE_STORAGE_KEYS.forEach(k => localStorage.removeItem(k));
    localStorage.removeItem(PROJECT_ID_KEY);
    localStorage.removeItem('cpq-project-status');
  };

  const loadProject = (id: string) => {
    clearLocalState();
    localStorage.setItem(PROJECT_ID_KEY, id);
    window.location.href = '/job-details';
  };

  const generateProjectName = () => {
    const existingNames = new Set(projects.map(p => p.name));
    let counter = 1;
    let name = `New Project ${counter}`;
    while (existingNames.has(name)) {
      counter++;
      name = `New Project ${counter}`;
    }
    return name;
  };

  const createProject = async () => {
    if (!user) { toast.error('You must be signed in.'); return; }
    setCreating(true);
    clearLocalState();
    const name = generateProjectName();
    const { data, error } = await supabase
      .from('projects')
      .insert({ name, data: {}, status: 'draft' as any, owner_id: user.id } as any)
      .select('id')
      .single();
    if (data && !error) {
      localStorage.setItem(PROJECT_ID_KEY, data.id);
      localStorage.setItem('cpq-project-status', 'draft');
      window.location.href = '/job-details';
    } else if (error) {
      toast.error('Failed to create job.');
    }
    setCreating(false);
  };

  const deleteProject = async () => {
    if (!deleteTarget) return;
    await supabase.from('projects').delete().eq('id', deleteTarget.id);
    if (localStorage.getItem(PROJECT_ID_KEY) === deleteTarget.id) {
      clearLocalState();
    }
    setDeleteTarget(null);
    fetchProjects();
    toast.success('Job deleted');
  };

  const duplicateProject = async (project: ProjectRow) => {
    const { data: full } = await supabase
      .from('projects')
      .select('*')
      .eq('id', project.id)
      .single();
    if (!full) return;

    const existingNames = new Set(projects.map(p => p.name));
    let copyName = `${project.name} (Copy)`;
    let i = 2;
    while (existingNames.has(copyName)) {
      copyName = `${project.name} (Copy ${i})`;
      i++;
    }

    const { error } = await supabase
      .from('projects')
      .insert({ name: copyName, data: full.data, status: 'draft' as any, folder: project.folder, owner_id: user!.id } as any);
    if (!error) {
      toast.success(`Duplicated as "${copyName}"`);
      fetchProjects();
    }
  };

  const exportProject = async (project: ProjectRow) => {
    const { data: full } = await supabase
      .from('projects')
      .select('*')
      .eq('id', project.id)
      .single();
    if (!full) { toast.error('Failed to load job data'); return; }

    const today = new Date().toISOString().slice(0, 10);
    const safeName = project.name.replace(/[^a-zA-Z0-9_\- ]/g, '').replace(/\s+/g, '_');
    const fileName = `${safeName}_CPQ_${today}.cpq`;

    const exportPayload = {
      _cpqVersion: 1,
      exportedAt: new Date().toISOString(),
      project: {
        name: full.name,
        status: full.status,
        data: full.data,
        submitted_at: full.submitted_at,
        submitted_snapshot: full.submitted_snapshot,
      },
    };

    const blob = new Blob([JSON.stringify(exportPayload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success('Job saved successfully to your device.');
  };

  // ── Import CPQ file ──
  const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.cpq')) {
      toast.error('Only .cpq files are accepted.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      const text = await file.text();
      const payload = JSON.parse(text);

      if (!payload._cpqVersion || !payload.project) {
        toast.error('Invalid CPQ file format.');
        return;
      }

      const importedName = payload.project.name || 'Imported Job';
      const existingNames = new Set(projects.map(p => p.name));

      let finalName = importedName;
      if (existingNames.has(finalName)) {
        let counter = 1;
        do {
          finalName = `${importedName} (Imported - ${String(counter).padStart(2, '0')})`;
          counter++;
        } while (existingNames.has(finalName));
      }

      const { error } = await supabase
        .from('projects')
        .insert({
          name: finalName,
          data: (payload.project.data || {}) as Json,
          status: 'draft' as any,
          folder: 'recent_imports',
          owner_id: user!.id,
        } as any);

      if (error) {
        toast.error('Failed to import job.');
        console.error(error);
      } else {
        toast.success(`"${finalName}" imported into Recent Imports.`);
        setImportsOpen(true);
        fetchProjects();
      }
    } catch {
      toast.error('Could not read file. Ensure it is a valid .cpq file.');
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [projects]);

  const moveToJobs = async (project: ProjectRow) => {
    const { error } = await supabase
      .from('projects')
      .update({ folder: null } as any)
      .eq('id', project.id);
    if (!error) {
      toast.success(`"${project.name}" moved to All Jobs.`);
      fetchProjects();
    }
  };

  const submitProject = async () => {
    if (!submitTarget) return;
    const { data: full } = await supabase
      .from('projects')
      .select('data')
      .eq('id', submitTarget.id)
      .single();

    const { error } = await supabase
      .from('projects')
      .update({
        status: 'submitted' as any,
        submitted_at: new Date().toISOString(),
        submitted_snapshot: (full?.data || {}) as Json,
      } as any)
      .eq('id', submitTarget.id);

    if (!error) {
      toast.success(`"${submitTarget.name}" marked as Submitted`);
      if (localStorage.getItem(PROJECT_ID_KEY) === submitTarget.id) {
        localStorage.setItem('cpq-project-status', 'submitted');
      }
      fetchProjects();
    }
    setSubmitTarget(null);
  };

  const unlockProject = async (project: ProjectRow) => {
    const { error } = await supabase
      .from('projects')
      .update({ status: 'active' as any } as any)
      .eq('id', project.id);
    if (!error) {
      toast.success(`"${project.name}" unlocked`);
      if (localStorage.getItem(PROJECT_ID_KEY) === project.id) {
        localStorage.setItem('cpq-project-status', 'active');
      }
      fetchProjects();
    }
  };

  const setProjectActive = async (project: ProjectRow) => {
    const { error } = await supabase
      .from('projects')
      .update({ status: 'active' as any } as any)
      .eq('id', project.id);
    if (!error) {
      toast.success(`"${project.name}" set to Active`);
      if (localStorage.getItem(PROJECT_ID_KEY) === project.id) {
        localStorage.setItem('cpq-project-status', 'active');
      }
      fetchProjects();
    }
  };

  const startRename = (project: ProjectRow) => {
    setRenamingId(project.id);
    setRenameValue(project.name);
    setTimeout(() => renameInputRef.current?.focus(), 50);
  };

  const commitRename = async () => {
    if (!renamingId || !renameValue.trim()) return;
    const { error } = await supabase
      .from('projects')
      .update({ name: renameValue.trim() })
      .eq('id', renamingId);
    if (!error) {
      toast.success('Job renamed');
      fetchProjects();
    }
    setRenamingId(null);
  };

  const cancelRename = () => { setRenamingId(null); };

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' }) +
      ' ' + d.toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' });
  };

  const activeId = localStorage.getItem(PROJECT_ID_KEY);
  const navigate = useNavigate();
  const activeProjectName = useMemo(() => {
    if (!activeId) return null;
    return projects.find(pr => pr.id === activeId)?.name || null;
  }, [activeId, projects]);

  const recentImports = useMemo(() => projects.filter(p => p.folder === 'recent_imports'), [projects]);
  const allJobs = useMemo(() => projects.filter(p => p.folder !== 'recent_imports'), [projects]);

  const renderProjectCard = (p: ProjectRow, isImport = false) => {
    const sc = STATUS_CONFIG[p.status] || STATUS_CONFIG.draft;
    return (
      <Card
        key={p.id}
        className={`transition-colors hover:bg-accent/50 ${p.id === activeId ? 'ring-2 ring-primary' : ''} ${p.status === 'submitted' ? 'opacity-80' : ''}`}
      >
        <CardContent className="py-3 px-4 flex items-center gap-4">
          {p.status === 'submitted' ? (
            <Lock className="h-5 w-5 text-amber-600 shrink-0" />
          ) : (
            <FolderOpen className="h-5 w-5 text-muted-foreground shrink-0" />
          )}
          <div className="flex-1 min-w-0 cursor-pointer" onClick={() => renamingId !== p.id && loadProject(p.id)}>
            {renamingId === p.id ? (
              <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                <Input
                  ref={renameInputRef}
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') commitRename();
                    if (e.key === 'Escape') cancelRename();
                  }}
                  className="h-7 text-sm"
                />
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={commitRename}>
                  <Check className="h-3.5 w-3.5" />
                </Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" onClick={cancelRename}>
                  <X className="h-3.5 w-3.5" />
                </Button>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-sm truncate">{p.name}</p>
                  <Badge variant={sc.variant} className={`text-[10px] px-1.5 py-0 h-4 ${sc.className}`}>
                    {sc.label}
                  </Badge>
                  {isImport && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-blue-400 text-blue-600 bg-blue-50">
                      Imported
                    </Badge>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Updated {fmtDate(p.updated_at)}
                  {p.submitted_at && <span className="ml-2">• Submitted {fmtDate(p.submitted_at)}</span>}
                  {p.id === activeId && <span className="ml-2 text-primary font-medium">• Open</span>}
                </p>
                <p className="text-[10px] text-muted-foreground/60 font-mono mt-0.5">ID: {p.id}</p>
              </>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="shrink-0 text-muted-foreground h-8 w-8">
                <MoreVertical className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {p.status !== 'submitted' && (
                <DropdownMenuItem onClick={() => startRename(p)}>
                  <Pencil className="h-3.5 w-3.5 mr-2" /> Rename
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => duplicateProject(p)}>
                <Copy className="h-3.5 w-3.5 mr-2" /> Duplicate
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => exportProject(p)}>
                <Download className="h-3.5 w-3.5 mr-2" /> Export CPQ File
              </DropdownMenuItem>
              {isImport && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => moveToJobs(p)}>
                    <FolderInput className="h-3.5 w-3.5 mr-2" /> Move to Jobs
                  </DropdownMenuItem>
                </>
              )}
              <DropdownMenuSeparator />
              {p.status === 'draft' && (
                <DropdownMenuItem onClick={() => setProjectActive(p)}>
                  <FolderOpen className="h-3.5 w-3.5 mr-2" /> Set Active
                </DropdownMenuItem>
              )}
              {p.status !== 'submitted' && (
                <DropdownMenuItem onClick={() => setSubmitTarget(p)}>
                  <Send className="h-3.5 w-3.5 mr-2" /> Mark as Submitted
                </DropdownMenuItem>
              )}
              {p.status === 'submitted' && (
                <DropdownMenuItem onClick={() => unlockProject(p)}>
                  <Unlock className="h-3.5 w-3.5 mr-2" /> Unlock Job
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => setDeleteTarget(p)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b border-[hsl(120,25%,75%)] bg-[hsl(120,40%,94%)] px-4 py-3">
        <div className="container mx-auto flex items-center gap-3">
          <img src={cpqLogo} alt="CPQ Logo" className="h-10 w-auto" />
          <h1 className="text-lg font-bold">Jobs</h1>
          <div className="ml-auto flex items-center gap-2">
            {activeId && (
              <Button variant="ghost" size="sm" className="text-xs gap-1.5" onClick={() => navigate('/')}>
                <ArrowLeft className="h-3.5 w-3.5" />
                Back to {activeProjectName || 'Job'}
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                  <UserIcon className="h-3.5 w-3.5" />
                  <span className="max-w-[160px] truncate">{user?.email}</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={signOut} className="text-destructive focus:text-destructive">
                  <LogOut className="h-3.5 w-3.5 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 max-w-3xl">
        {/* Action buttons */}
        <div className="flex items-center justify-between mb-6">
          <p className="text-sm text-muted-foreground">
            {projects.length} job{projects.length !== 1 ? 's' : ''}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => fileInputRef.current?.click()}>
              <Upload className="h-4 w-4 mr-2" />
              Import Job
            </Button>
            <input
              ref={fileInputRef}
              type="file"
              accept=".cpq"
              className="hidden"
              onChange={handleImportFile}
            />
            <Button onClick={createProject} disabled={creating} size="sm">
              {creating ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
              New Job
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Recent Imports folder */}
            {recentImports.length > 0 && (
              <div className="mb-6">
                <button
                  className="flex items-center gap-2 mb-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors w-full text-left"
                  onClick={() => setImportsOpen(o => !o)}
                >
                  {importsOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                  <FolderInput className="h-4 w-4" />
                  Recent Imports
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 ml-1">
                    {recentImports.length}
                  </Badge>
                </button>
                {importsOpen && (
                  <div className="space-y-2 pl-2 border-l-2 border-blue-200 ml-2">
                    {recentImports.map(p => renderProjectCard(p, true))}
                  </div>
                )}
              </div>
            )}

            {/* All Jobs */}
            <div>
              {recentImports.length > 0 && (
                <p className="text-sm font-semibold text-muted-foreground mb-2 flex items-center gap-2">
                  <FolderOpen className="h-4 w-4" />
                  All Jobs
                </p>
              )}
              {allJobs.length === 0 ? (
                <Card>
                  <CardContent className="py-12 text-center text-muted-foreground">
                    <p>No jobs yet. Click "New Job" to get started.</p>
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-2">
                  {allJobs.map(p => renderProjectCard(p))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete job?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{deleteTarget?.name}". This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={deleteProject} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Submit confirmation */}
      <AlertDialog open={!!submitTarget} onOpenChange={(open) => !open && setSubmitTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Submitted?</AlertDialogTitle>
            <AlertDialogDescription>
              This will lock "{submitTarget?.name}" and preserve the current pricing basis as a snapshot.
              The job will become read-only. You can unlock it later or duplicate it as a working copy.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={submitProject}>
              Submit &amp; Lock
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
