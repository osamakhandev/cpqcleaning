import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import FormattedNumberInput from '@/components/ui/formatted-number-input';
import { formatCurrency } from '@/lib/costingCalculations';

/* ── Shared class constants (CPQ Table Standard) ── */
export const headCls  = 'px-2.5 py-2 text-xs font-semibold text-center align-middle';
export const cellCls  = 'text-right px-2.5 py-1.5 font-mono text-xs align-middle';
export const labelCls = 'px-2.5 py-1.5 text-xs align-middle';
export const actionCls = 'px-1 py-1.5 text-center align-middle';
export const fmt = (v: number) => v === 0 ? '–' : formatCurrency(v);

/* ── Standard column width presets (percentages) ── */
// 5-column tables: Label | Rate/Cost | Units/Qty | Total | Action
export const COL_5 = { label: '30%', cost: '22%', units: '14%', total: '28%', action: '6%' };
// 7-column tables: Label | Desc | Qty | Freq | Cost | Total | Action
export const COL_7 = { label: '22%', desc: '22%', qty: '12%', freq: '12%', cost: '12%', total: '14%', action: '6%' };

export function CurrencyCell({ value, onChange, className = '' }: { value: number; onChange: (v: number) => void; className?: string }) {
  return (
    <FormattedNumberInput
      value={value}
      onChange={onChange}
      decimals={2}
      min={0}
      placeholder="Enter value…"
      className={`h-7 text-xs text-right font-mono bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)] ${className}`}
    />
  );
}

export function NumInput({ value, onChange, integer = false, className = '' }: { value: number; onChange: (v: number) => void; integer?: boolean; className?: string }) {
  return (
    <Input
      type="number"
      min={0}
      step={integer ? 1 : 0.01}
      placeholder="Enter value…"
      className={`h-7 text-xs text-right font-mono bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)] ${className}`}
      defaultValue={value || ''}
      onBlur={e => { const v = integer ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0; onChange(Math.max(0, v)); }}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}

export function TextInput({ value, onChange, className = '' }: { value: string; onChange: (v: string) => void; className?: string }) {
  return (
    <Input
      type="text"
      placeholder="Select or type…"
      className={`h-7 text-xs bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)] ${className}`}
      defaultValue={value}
      onBlur={e => onChange(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
    />
  );
}

export function AddRowButton({ onClick }: { onClick: () => void }) {
  return (
    <div className="px-3 py-1.5 border-t border-border bg-background">
      <Button variant="outline" size="sm" onClick={onClick} className="h-7 text-xs">
        <Plus className="h-3 w-3 mr-1" /> Add Row
      </Button>
    </div>
  );
}

export function DeleteButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" size="icon" className="h-6 w-6 mx-auto" onClick={onClick}>
      <Trash2 className="h-3 w-3 text-destructive" />
    </Button>
  );
}

export function TotalFooter({ label, weekly, monthly, annual }: { label: string; weekly: number; monthly: number; annual: number }) {
  return (
    <div className="bg-[hsl(48,80%,85%)] border-t border-border px-3 py-2">
      <div className="flex items-center justify-between text-xs font-bold mb-1">
        <span>{label}</span>
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="flex justify-between"><span className="text-muted-foreground">Weekly</span><span className="font-mono font-semibold">{fmt(weekly)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Monthly</span><span className="font-mono font-semibold">{fmt(monthly)}</span></div>
        <div className="flex justify-between"><span className="text-muted-foreground">Annual</span><span className="font-mono font-semibold">{fmt(annual)}</span></div>
      </div>
    </div>
  );
}
