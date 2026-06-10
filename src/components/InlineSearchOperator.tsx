import { useState } from 'react';
import { Search, X } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface InlineSearchOperatorProps {
  onFilterChange: (value: string) => void;
  matchCount: number;
  totalCount: number;
}

export function InlineSearchOperator({ onFilterChange, matchCount, totalCount }: InlineSearchOperatorProps) {
  const [value, setValue] = useState('');

  const handleChange = (v: string) => {
    setValue(v);
    onFilterChange(v);
  };

  const isFiltering = value.trim() !== '';

  return (
    <div className="w-full flex justify-center no-print">
      <div className="w-full max-w-md">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search operator…"
            value={value}
            onChange={e => handleChange(e.target.value)}
            className="pl-10 pr-9 h-10"
          />
          {value && (
            <button
              onClick={() => handleChange('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
        {isFiltering && (
          <p className="text-xs text-muted-foreground mt-1 text-center">
            {matchCount} of {totalCount} operator{totalCount !== 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}
