import { useState, useRef, useEffect } from 'react';
import { Check, ChevronsUpDown, Plus, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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

interface TaskComboboxProps {
  value: string;
  onChange: (value: string) => void;
  taskLibrary: string[];
  onAddTask?: (task: string) => void;
  onDeleteTask?: (task: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  /** If true, renders as a compact inline input (no popover trigger button) */
  compact?: boolean;
}

function normalizeTask(t: string): string {
  return t.trim().replace(/\s+/g, ' ');
}

export function TaskCombobox({
  value,
  onChange,
  taskLibrary,
  onAddTask,
  onDeleteTask,
  placeholder = 'Select or type task...',
  className,
  inputClassName,
  compact,
}: TaskComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Reset search when popover opens
  useEffect(() => {
    if (open) {
      setSearch(value || '');
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open, value]);

  const normalizedSearch = normalizeTask(search);
  const filtered = taskLibrary.filter(t =>
    t.toLowerCase().includes(normalizedSearch.toLowerCase())
  );

  // Check if typed text already exists (case-insensitive)
  const exactMatch = taskLibrary.some(
    t => t.toLowerCase() === normalizedSearch.toLowerCase()
  );
  const showAddOption = normalizedSearch.length > 0 && !exactMatch;

  const selectTask = (task: string) => {
    onChange(task);
    setOpen(false);
  };

  const addAndSelect = () => {
    if (!normalizedSearch) return;
    onAddTask?.(normalizedSearch);
    onChange(normalizedSearch);
    setOpen(false);
  };

  const handleDeleteClick = (e: React.MouseEvent, task: string) => {
    e.stopPropagation();
    setDeleteConfirm(task);
  };

  const confirmDelete = () => {
    if (deleteConfirm) {
      onDeleteTask?.(deleteConfirm);
      if (value?.toLowerCase() === deleteConfirm.toLowerCase()) {
        onChange('');
      }
      setDeleteConfirm(null);
    }
  };

  return (
    <>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {compact ? (
            <div
              className={cn(
                'flex items-center cursor-pointer rounded-md border border-input bg-background px-2 py-1 text-sm ring-offset-background hover:bg-accent/50 transition-colors min-h-[32px]',
                className
              )}
              onClick={() => setOpen(true)}
            >
              <span className={cn('flex-1 truncate', !value && 'text-muted-foreground')}>
                {value || placeholder}
              </span>
              <ChevronsUpDown className="ml-1 h-3 w-3 shrink-0 opacity-50" />
            </div>
          ) : (
            <Button
              variant="outline"
              role="combobox"
              aria-expanded={open}
              className={cn('w-full justify-between font-normal', className)}
            >
              <span className={cn('truncate', !value && 'text-muted-foreground')}>
                {value || placeholder}
              </span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          )}
        </PopoverTrigger>
        <PopoverContent className="w-[280px] p-0" align="start">
          <div className="p-2 border-b">
            <Input
              ref={inputRef}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search or type new task..."
              className={cn('h-8 text-sm', inputClassName)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  if (showAddOption) {
                    addAndSelect();
                  } else if (filtered.length > 0) {
                    selectTask(filtered[0]);
                  } else if (normalizedSearch) {
                    addAndSelect();
                  }
                }
              }}
            />
          </div>
          <div className="max-h-[200px] overflow-y-auto">
            {filtered.length === 0 && !showAddOption && (
              <p className="py-3 text-center text-sm text-muted-foreground">No tasks found.</p>
            )}
            {filtered.map((task) => (
              <div
                key={task}
                className={cn(
                  'flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent transition-colors group',
                  value === task && 'bg-accent'
                )}
                onClick={() => selectTask(task)}
              >
                <Check className={cn('h-3.5 w-3.5 shrink-0', value === task ? 'opacity-100' : 'opacity-0')} />
                <span className="truncate flex-1">{task}</span>
                {onDeleteTask && (
                  <button
                    className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-destructive/10 shrink-0"
                    onClick={(e) => handleDeleteClick(e, task)}
                    title="Delete task from library"
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </button>
                )}
              </div>
            ))}
            {showAddOption && (
              <div
                className="flex items-center gap-2 px-3 py-2 text-sm cursor-pointer hover:bg-accent transition-colors border-t text-primary"
                onClick={addAndSelect}
              >
                <Plus className="h-3.5 w-3.5 shrink-0" />
                <span>Add "{normalizedSearch}"</span>
              </div>
            )}
          </div>
          {value && (
            <div className="border-t p-1">
              <Button
                variant="ghost"
                size="sm"
                className="w-full h-7 text-xs text-muted-foreground"
                onClick={() => { onChange(''); setOpen(false); }}
              >
                Clear
              </Button>
            </div>
          )}
        </PopoverContent>
      </Popover>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete task from library?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove "{deleteConfirm}" from the task library and clear it from all operators currently using it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
