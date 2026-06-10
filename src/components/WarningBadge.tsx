import { AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WarningBadgeProps {
  warnings: string[];
  compact?: boolean;
}

export function WarningBadge({ warnings, compact = false }: WarningBadgeProps) {
  if (warnings.length === 0) return null;

  if (compact) {
    return (
      <span className="warning-badge" title={warnings.join('\n')}>
        <AlertTriangle className="h-3 w-3" />
        {warnings.length}
      </span>
    );
  }

  return (
    <div className="space-y-1">
      {warnings.map((warning, index) => (
        <div key={index} className="warning-badge">
          <AlertTriangle className="h-3 w-3" />
          {warning}
        </div>
      ))}
    </div>
  );
}
