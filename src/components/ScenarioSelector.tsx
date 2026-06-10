import { useState, useRef } from 'react';
import { Save, FolderOpen, Copy, Trash2, Star, Download, Upload, Plus, Pencil, Check, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { useRosterStore } from '@/contexts/RosterContext';
import { toast } from 'sonner';

export function ScenarioSelector({ onScenarioChange }: { onScenarioChange?: () => Promise<void> }) {
  const {
    scenarios,
    activeScenarioId,
    defaultScenarioId,
    saveScenario,
    loadScenario,
    deleteScenario,
    renameScenario,
    duplicateScenario,
    setDefaultScenario,
    exportScenario,
    importScenario,
  } = useRosterStore();

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const activeScenario = scenarios.find(s => s.id === activeScenarioId);

  const handleSave = async () => {
    if (!newName.trim()) return;
    saveScenario(newName.trim());
    setNewName('');
    setShowSaveDialog(false);
    if (onScenarioChange) {
      try {
        await onScenarioChange();
        toast.success(`Scenario saved: ${newName.trim()}`);
      } catch {
        toast.error('Save failed – retry');
      }
    } else {
      toast.success(`Scenario saved: ${newName.trim()}`);
    }
  };

  const handleLoad = (id: string) => {
    loadScenario(id);
    const s = scenarios.find(sc => sc.id === id);
    toast.success(`Loaded "${s?.name}"`);
  };

  const handleDelete = (id: string) => {
    const s = scenarios.find(sc => sc.id === id);
    deleteScenario(id);
    toast.success(`Deleted "${s?.name}"`);
  };

  const handleDuplicate = async (id: string) => {
    duplicateScenario(id);
    const duped = scenarios[scenarios.length]; // won't have it yet, use generic name
    if (onScenarioChange) {
      try {
        await onScenarioChange();
        toast.success('Scenario saved: duplicate');
      } catch {
        toast.error('Save failed – retry');
      }
    } else {
      toast.success('Scenario duplicated');
    }
  };

  const handleSetDefault = (id: string) => {
    setDefaultScenario(defaultScenarioId === id ? null : id);
    toast.success(defaultScenarioId === id ? 'Default cleared' : 'Set as default on startup');
  };

  const handleExport = (id: string) => {
    const json = exportScenario(id);
    if (!json) return;
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const s = scenarios.find(sc => sc.id === id);
    a.href = url;
    a.download = `${s?.name || 'scenario'}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Exported');
  };

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleImportFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const id = importScenario(reader.result as string);
      if (id) {
        toast.success('Scenario imported');
      } else {
        toast.error('Invalid scenario file');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const handleRenameSubmit = (id: string) => {
    if (renameValue.trim()) {
      renameScenario(id, renameValue.trim());
      toast.success('Renamed');
    }
    setRenamingId(null);
  };

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="sm" className="gap-1.5 text-xs">
            <FolderOpen className="h-3.5 w-3.5" />
            {activeScenario ? activeScenario.name : 'Scenarios'}
            {scenarios.length > 0 && (
              <Badge variant="secondary" className="ml-1 text-[10px] px-1 py-0">
                {scenarios.length}
              </Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72">
          {scenarios.length === 0 && (
            <div className="px-3 py-2 text-xs text-muted-foreground">
              No saved scenarios yet
            </div>
          )}
          {scenarios.map(s => (
            <DropdownMenuItem
              key={s.id}
              className="flex items-center justify-between gap-2 cursor-pointer"
              onSelect={(e) => {
                e.preventDefault();
                if (renamingId === s.id) return;
                handleLoad(s.id);
              }}
            >
              {renamingId === s.id ? (
                <div className="flex items-center gap-1 flex-1" onClick={e => e.stopPropagation()}>
                  <Input
                    value={renameValue}
                    onChange={e => setRenameValue(e.target.value)}
                    className="h-6 text-xs"
                    autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') handleRenameSubmit(s.id); if (e.key === 'Escape') setRenamingId(null); }}
                  />
                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => handleRenameSubmit(s.id)}>
                    <Check className="h-3 w-3" />
                  </Button>
                  <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => setRenamingId(null)}>
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <>
                  <span className="flex items-center gap-1.5 truncate text-xs">
                    {s.id === defaultScenarioId && <Star className="h-3 w-3 fill-yellow-400 text-yellow-400" />}
                    {s.id === activeScenarioId && <span className="w-1.5 h-1.5 rounded-full bg-primary" />}
                    {s.name}
                  </span>
                  <div className="flex items-center gap-0.5" onClick={e => e.stopPropagation()}>
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => { setRenamingId(s.id); setRenameValue(s.name); }}>
                      <Pencil className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => handleSetDefault(s.id)}>
                      <Star className={`h-3 w-3 ${s.id === defaultScenarioId ? 'fill-yellow-400 text-yellow-400' : ''}`} />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => handleDuplicate(s.id)}>
                      <Copy className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-5 w-5" onClick={() => handleExport(s.id)}>
                      <Download className="h-3 w-3" />
                    </Button>
                    <Button size="icon" variant="ghost" className="h-5 w-5 text-destructive" onClick={() => handleDelete(s.id)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </>
              )}
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setShowSaveDialog(true)}>
            <Save className="h-3.5 w-3.5 mr-2" />
            Save current as scenario
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={handleImportClick}>
            <Upload className="h-3.5 w-3.5 mr-2" />
            Import scenario file
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <input ref={fileInputRef} type="file" accept=".json" className="hidden" onChange={handleImportFile} />

      <Dialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Save Scenario</DialogTitle>
          </DialogHeader>
          <Input
            placeholder="Scenario name..."
            value={newName}
            onChange={e => setNewName(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); }}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSaveDialog(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={!newName.trim()}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
