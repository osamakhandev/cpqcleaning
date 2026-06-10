import { useState, useEffect } from 'react';
import { Search, X, GripHorizontal, Minus } from 'lucide-react';
import { useDraggable } from '@/hooks/useDraggable';
import { useIsMobile } from '@/hooks/use-mobile';
import { Input } from '@/components/ui/input';

interface FloatingSearchOperatorProps {
  onFilterChange: (value: string) => void;
  matchCount: number;
  totalCount: number;
  storageKey?: string;
}

export function FloatingSearchOperator({ onFilterChange, matchCount, totalCount, storageKey = 'cpq-search-operator-pos' }: FloatingSearchOperatorProps) {
  const [value, setValue] = useState('');
  const [collapsed, setCollapsed] = useState(false);
  const isMobile = useIsMobile();
  const { elRef, style, dragHandleProps } = useDraggable({ storageKey, defaultPosition: 'top-center' });

  useEffect(() => {
    if (isMobile) setCollapsed(true);
  }, [isMobile]);

  const handleChange = (v: string) => {
    setValue(v);
    onFilterChange(v);
  };

  const isFiltering = value.trim() !== '';

  if (collapsed) {
    return (
      <div ref={elRef} style={{ ...style, zIndex: 50 }} className="no-print">
        <button
          onClick={() => setCollapsed(false)}
          className="flex items-center justify-center h-10 w-10 rounded-full bg-background border border-border shadow-lg hover:bg-accent transition-colors"
        >
          <Search className="h-4 w-4 text-muted-foreground" />
          {isFiltering && (
            <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-primary" />
          )}
        </button>
      </div>
    );
  }

  return (
    <div ref={elRef} style={{ ...style, zIndex: 50 }} className="bg-background border border-border rounded-lg shadow-lg w-72 no-print">
      <div
        {...dragHandleProps}
        className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/30 rounded-t-lg select-none"
      >
        <div className="flex items-center gap-1.5">
          <GripHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-muted-foreground">Search Operator</span>
        </div>
        <button onClick={() => setCollapsed(true)} className="text-muted-foreground hover:text-foreground">
          <Minus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="p-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search operator…"
            value={value}
            onChange={e => handleChange(e.target.value)}
            className="pl-9 pr-8 h-9"
            autoFocus
          />
          {value && (
            <button
              onClick={() => handleChange('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {isFiltering && (
          <p className="text-xs text-muted-foreground mt-1.5 px-0.5">
            {matchCount} of {totalCount} operator{totalCount !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}
