import React, { useState, useMemo, useCallback } from "react";
import AssessmentChecklist from "./AssessmentChecklist";
import { fmtNum } from "@/lib/utils";
import { useAssessment } from "@/contexts/AssessmentContext";
import {
  RosterSettings,
  DEFAULT_ROSTER_SETTINGS,
  DayOfWeek,
  ALL_DAYS,
  CoreRosterPlan,
  RosterRow,
  OptimisationMode,
} from "@/types/laRoster";
import {
  getCoreWeeklyHours,
  generateCoreRoster,
} from "@/lib/laRosterCalculations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import FormattedNumberInput from "@/components/ui/formatted-number-input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertTriangle,
  ChevronDown,
  RefreshCw,
  Lock,
  Calendar,
} from "lucide-react";
import HowItWorks from "@/components/HowItWorks";
import { HELP_CONTENT } from "@/data/helpContent";

const CORE_TABS_INCLUDED = [
  { id: "tenancy-areas", label: "Tenancy Areas" },
  { id: "common-public", label: "Common & Public Areas" },
  { id: "detailer-periodics", label: "W'end / Detailer" },
];

// ─── Roster Table ───────────────────────────────────────────
interface RosterTableProps {
  rows: RosterRow[];
  activeDays: DayOfWeek[];
  onCellEdit?: (rowIdx: number, day: DayOfWeek, value: number) => void;
  editable?: boolean;
  coreWeeklyHours?: number;
}

const RosterTable: React.FC<RosterTableProps> = ({
  rows,
  activeDays,
  onCellEdit,
  editable = false,
  coreWeeklyHours,
}) => {
  const dayTotals = ALL_DAYS.map(d =>
    rows.reduce((s, r) => s + r.shifts[d].hours, 0)
  );
  const weekTotal = dayTotals.reduce((a, b) => a + b, 0);

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="text-left py-1.5 px-2 text-muted-foreground font-medium w-24">Staff</th>
            {ALL_DAYS.map(d => (
              <th
                key={d}
                className={`text-center py-1.5 px-1 font-medium w-16 ${
                  activeDays.includes(d) ? "text-foreground" : "text-muted-foreground/40"
                }`}
              >
                {d}
              </th>
            ))}
            <th className="text-center py-1.5 px-2 text-muted-foreground font-medium w-16">Total</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => {
            const rowTotal = ALL_DAYS.reduce((s, d) => s + row.shifts[d].hours, 0);
            return (
              <tr key={ri} className="border-b border-border/50">
                <td className="py-1 px-2 text-muted-foreground">{row.label}</td>
                {ALL_DAYS.map(d => {
                  const cell = row.shifts[d];
                  const isActive = activeDays.includes(d);
                  return (
                    <td key={d} className="text-center py-1 px-1">
                      {isActive && cell.hours > 0 ? (
                        editable ? (
                          <FormattedNumberInput
                            value={cell.hours}
                            onChange={v => onCellEdit?.(ri, d, v)}
                            decimals={2}
                            className={`h-7 w-14 text-center text-xs font-mono mx-auto ${
                              cell.userEdited ? "border-primary bg-primary/5" : ""
                            }`}
                          />
                        ) : (
                          <div className="flex flex-col items-center">
                            <span
                              className={`font-mono ${
                                cell.userEdited ? "text-primary font-semibold" :
                                cell.hours > 4.001 ? "text-amber-600 font-semibold" :
                                "text-foreground"
                              }`}
                            >
                              {fmtNum(cell.hours, 2)}h
                            </span>
                            {cell.hours > 4.001 && !cell.userEdited && (
                              <span className="text-[8px] text-amber-600 leading-tight">Exception</span>
                            )}
                          </div>
                        )
                      ) : (
                        <span className="text-muted-foreground/30">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="text-center py-1 px-2 font-mono font-medium text-foreground">
                  {fmtNum(rowTotal, 2)}
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="border-t border-border font-medium">
            <td className="py-1.5 px-2 text-muted-foreground">Day total</td>
            {ALL_DAYS.map((d, i) => (
              <td key={d} className="text-center py-1.5 px-1 font-mono text-foreground">
                {dayTotals[i] > 0 ? fmtNum(dayTotals[i], 2) : "—"}
              </td>
            ))}
            <td className="text-center py-1.5 px-2 font-mono font-bold text-foreground">
              {fmtNum(weekTotal, 2)}
            </td>
          </tr>
          {coreWeeklyHours !== undefined && (
            <tr>
              <td className="py-1 px-2 text-muted-foreground text-[10px]">Variance</td>
              <td colSpan={7}></td>
              <td className="text-center py-1 px-2">
                <span
                  className={`font-mono text-[11px] font-semibold ${
                    Math.abs(weekTotal - coreWeeklyHours) > 0.25
                      ? "text-destructive"
                      : "text-muted-foreground"
                  }`}
                >
                  {(weekTotal - coreWeeklyHours) >= 0 ? "+" : ""}
                  {fmtNum(weekTotal - coreWeeklyHours, 2)}h
                </span>
              </td>
            </tr>
          )}
        </tfoot>
      </table>
    </div>
  );
};

// ─── Main Component ─────────────────────────────────────────
const SuggestedRoster: React.FC = () => {
  const { lineItems, elementTasks, buildingElements, getTabHours, getWendDetailerHours, wendDetailerIncludeInCore, wendDetailerPrograms, wendDetailerMode } = useAssessment();

  // Settings
  const [settings, setSettings] = useState<RosterSettings>({ ...DEFAULT_ROSTER_SETTINGS });
  const [locked, setLocked] = useState(false);
  const [editMode, setEditMode] = useState(false);

  // Core hours (includes W'end/Detailer if enabled)
  const baseWeeklyHours = useMemo(
    () => getCoreWeeklyHours(elementTasks, buildingElements, lineItems),
    [elementTasks, buildingElements, lineItems]
  );
  const wendDetailerHours = getWendDetailerHours();
  const coreWeeklyHours = wendDetailerIncludeInCore ? baseWeeklyHours + wendDetailerHours : baseWeeklyHours;
  

  // Weekend hours exist check
  const hasWeekendHours = wendDetailerHours > 0;
  const weekendDaysEnabled = settings.coreWorkDays.includes("Sat") || settings.coreWorkDays.includes("Sun");

  // Tab breakdown
  const tabBreakdown = useMemo(() => {
    return CORE_TABS_INCLUDED.map(t => ({
      ...t,
      hours: getTabHours(t.id),
    }));
  }, [getTabHours]);

  // Core roster plan
  const [corePlan, setCorePlan] = useState<CoreRosterPlan>(() =>
    generateCoreRoster(coreWeeklyHours, settings)
  );




  // Actions
  const regenerate = useCallback(() => {
    setCorePlan(generateCoreRoster(coreWeeklyHours, settings));
    setLocked(false);
    setEditMode(false);
  }, [coreWeeklyHours, settings]);

  const handleDayToggle = (day: DayOfWeek) => {
    setSettings(prev => {
      const days = prev.coreWorkDays.includes(day)
        ? prev.coreWorkDays.filter(d => d !== day)
        : [...prev.coreWorkDays, day];
      return { ...prev, coreWorkDays: days };
    });
  };

  const handleCellEdit = (rowIdx: number, day: DayOfWeek, value: number) => {
    if (locked) return;
    setCorePlan(prev => {
      const newRows = prev.rows.map((r, i) => {
        if (i !== rowIdx) return r;
        return {
          ...r,
          shifts: {
            ...r.shifts,
            [day]: { hours: value, userEdited: true },
          },
        };
      });
      return { ...prev, rows: newRows };
    });
  };

  const applyPreset = (days: DayOfWeek[]) => {
    setSettings(prev => ({ ...prev, coreWorkDays: days }));
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <HowItWorks {...HELP_CONTENT["la-suggested-roster"]} size="sm" />
      </div>
      {/* ── Core Cleaning Summary ── */}
      <div className="border border-border rounded-lg bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <Calendar className="h-4 w-4" />
          Core Cleaning Summary
        </h2>

        <div className="grid grid-cols-3 gap-4 mb-4">
          <div className="bg-muted/50 rounded-md p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Weekly Hours</p>
            <p className="text-xl font-bold font-mono text-foreground">{fmtNum(coreWeeklyHours, 2)}</p>
          </div>
          <div className="bg-muted/50 rounded-md p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Work Days</p>
            <p className="text-xl font-bold font-mono text-foreground">{settings.coreWorkDays.length}</p>
          </div>
          <div className="bg-muted/50 rounded-md p-3">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wide">Daily Avg</p>
            <p className="text-xl font-bold font-mono text-foreground">
              {settings.coreWorkDays.length > 0
                ? fmtNum(coreWeeklyHours / settings.coreWorkDays.length, 2)
                : "0.00"}
            </p>
          </div>
        </div>

        {/* Tab breakdown */}
        <div className="mb-4">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wide mb-1">Included in Core</p>
          <div className="flex flex-wrap gap-2">
            {tabBreakdown.map(t => (
              <Badge key={t.id} variant="secondary" className="text-[10px] font-mono">
                {t.label}: {fmtNum(t.hours, 1)}h
              </Badge>
            ))}
          </div>
        </div>

        {/* Labour Assessment Checklist */}
        <AssessmentChecklist />

        {/* Day toggles */}
        <div className="mb-4">
          <Label className="text-xs text-muted-foreground mb-1.5 block">Work Days</Label>
          <div className="flex gap-1 mb-2">
            {ALL_DAYS.map(d => (
              <button
                key={d}
                onClick={() => handleDayToggle(d)}
                className={`w-9 h-8 rounded text-xs font-medium transition-colors ${
                  settings.coreWorkDays.includes(d)
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => applyPreset(["Mon", "Tue", "Wed", "Thu", "Fri"] as DayOfWeek[])}>
              Mon–Fri
            </Button>
            <Button variant="outline" size="sm" className="h-6 text-[10px]" onClick={() => applyPreset([...ALL_DAYS])}>
              7 Days
            </Button>
          </div>
        </div>

        {/* Shift settings */}
        <div className="grid grid-cols-4 gap-3 mb-4">
          <div>
            <Label className="text-[10px] text-muted-foreground">Min Shift (h)</Label>
            <FormattedNumberInput
              value={settings.minShiftHours}
              onChange={v => setSettings(prev => ({ ...prev, minShiftHours: v }))}
              decimals={2}
              className="h-7 text-xs font-mono mt-0.5"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Max Shift (h)</Label>
            <FormattedNumberInput
              value={settings.maxShiftHours}
              onChange={v => setSettings(prev => ({ ...prev, maxShiftHours: v }))}
              decimals={2}
              className="h-7 text-xs font-mono mt-0.5"
            />
          </div>
          <div>
            <Label className="text-[10px] text-muted-foreground">Rounding (h)</Label>
            <Input
              type="number" step={0.05}
              value={settings.roundingIncrement}
              onChange={e => setSettings(prev => ({ ...prev, roundingIncrement: parseFloat(e.target.value) || 0.25 }))}
              className="h-7 text-xs font-mono mt-0.5"
            />
          </div>
          <div className="flex flex-col justify-end">
            <div className="flex items-center gap-1.5">
              <Switch
                checked={settings.preferSingleStaff}
                onCheckedChange={v => setSettings(prev => ({ ...prev, preferSingleStaff: v }))}
                className="scale-75"
              />
              <Label className="text-[10px] text-muted-foreground">Prefer single staff</Label>
            </div>
          </div>
        </div>

        {/* Optimisation & exception settings */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Optimisation Preference</Label>
            <Select
              value={settings.optimisationMode}
              onValueChange={v => setSettings(prev => ({ ...prev, optimisationMode: v as OptimisationMode }))}
            >
              <SelectTrigger className="h-7 w-full text-[11px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="no-exceed">Closest without exceeding assessed hours</SelectItem>
                <SelectItem value="allow-exceed">Closest (allow exceeding)</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs text-muted-foreground mb-1.5 block">Exception Shift</Label>
            <div className="flex items-center gap-2 mt-1">
              <Switch
                checked={settings.allowExceptionShift}
                onCheckedChange={v => setSettings(prev => ({ ...prev, allowExceptionShift: v }))}
                className="scale-75"
              />
              <span className="text-[10px] text-muted-foreground">
                Allow one exception shift up to 7.0h to reduce variance
              </span>
            </div>
          </div>
        </div>

        {Math.abs(settings.minShiftHours - settings.maxShiftHours) < 0.001 && (
          <p className="text-[10px] text-muted-foreground mb-4">
            Fixed shift length ({settings.minShiftHours}h): operators vary days/week. {settings.allowExceptionShift ? "One exception shift (up to 7h) allowed if needed." : "No exception shifts."}
          </p>
        )}

        {/* Controls */}
        <div className="flex gap-2 mb-4">
          <Button size="sm" className="h-7 text-xs" onClick={regenerate}>
            <RefreshCw className="h-3 w-3 mr-1" />Regenerate
          </Button>
          <Button size="sm" variant={editMode ? "default" : "outline"} className="h-7 text-xs" onClick={() => setEditMode(!editMode)}>
            {editMode ? "Done Editing" : "Edit Shifts"}
          </Button>
          <Button size="sm" variant={locked ? "default" : "outline"} className="h-7 text-xs" onClick={() => setLocked(!locked)}>
            <Lock className="h-3 w-3 mr-1" />{locked ? "Unlock" : "Lock Roster"}
          </Button>
        </div>

        {/* Weekend warning */}
        {hasWeekendHours && !weekendDaysEnabled && (
          <div className="mb-4 flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/20 border border-amber-500/30 rounded px-2 py-1.5">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            Weekend/detailer hours exist ({fmtNum(wendDetailerHours, 1)}h) but weekend workdays (Sat/Sun) are not enabled in roster. Enable Sat/Sun above to roster weekend staff.
          </div>
        )}

        {/* Warnings */}
        {corePlan.warnings.length > 0 && (
          <div className="mb-4 space-y-1">
            {corePlan.warnings.map((w, i) => (
              <div key={i} className="flex items-start gap-1.5 text-[11px] text-destructive bg-destructive/5 border border-destructive/20 rounded px-2 py-1">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />{w}
              </div>
            ))}
          </div>
        )}

        {/* Core Roster Table */}
        <RosterTable
          rows={corePlan.rows}
          activeDays={settings.coreWorkDays}
          editable={editMode && !locked}
          onCellEdit={handleCellEdit}
          coreWeeklyHours={coreWeeklyHours}
        />
      </div>


      {/* ── Discretionary Staff Roster ── */}
      <DiscretionaryStaffRoster buildingElements={buildingElements} />

      {/* ── Weekend / Detailer Programs Roster ── */}
      <WeekendDetailerRoster programs={wendDetailerPrograms} />
    </div>
  );
};

// ─── Discretionary Staff Roster ─────────────────────────────
function calcEndTime(startTime: string, hoursPerDay: number): string {
  if (!startTime || !startTime.includes(":") || !hoursPerDay || hoursPerDay <= 0) return "";
  const [h, m] = startTime.split(":").map(Number);
  if (isNaN(h) || isNaN(m)) return "";
  const startMin = h * 60 + m;
  const paidMin = Math.round(hoursPerDay * 60);
  // 30-min break for shifts > 4.5h. Unpaid (extends end) when shift entirely within 06:00-18:00.
  const hasBreak = hoursPerDay > 4.5;
  let coverageMin = paidMin;
  if (hasBreak) {
    const dayStart = 6 * 60;
    const dayEnd = 18 * 60;
    const tentativeEndUnpaid = startMin + paidMin + 30;
    const entirelyDaytime = startMin >= dayStart && tentativeEndUnpaid <= dayEnd;
    if (entirelyDaytime) coverageMin = paidMin + 30;
  }
  const endMin = (startMin + coverageMin) % (24 * 60);
  const eh = Math.floor(endMin / 60);
  const em = endMin % 60;
  return `${String(eh).padStart(2, "0")}:${String(em).padStart(2, "0")}`;
}

interface DiscretionaryStaffRosterProps {
  buildingElements: { id: string; group: string; elementName: string; included: boolean; quantityValue: number; hoursPerDay?: number; startTime?: string }[];
}

const DiscretionaryStaffRoster: React.FC<DiscretionaryStaffRosterProps> = ({ buildingElements }) => {
  const items = buildingElements.filter(e => e.group === "Supervision" && e.included);

  return (
    <div className="border border-border rounded-lg bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground mb-3">Discretionary Staff Roster</h2>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No discretionary staff enabled.
        </p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">Role</th>
              <th className="text-center py-1.5 px-2 text-muted-foreground font-medium w-16">Qty</th>
              <th className="text-center py-1.5 px-2 text-muted-foreground font-medium w-20">Hrs/Day</th>
              <th className="text-center py-1.5 px-2 text-muted-foreground font-medium w-32">Shift</th>
            </tr>
          </thead>
          <tbody>
            {items.map(el => {
              const qty = Math.max(0, Math.floor(el.quantityValue ?? 0));
              const hpd = el.hoursPerDay ?? 0;
              const start = el.startTime ?? "";
              const end = calcEndTime(start, hpd);
              const shiftLabel = start && end ? `${start} – ${end}` : "—";
              const incomplete = !start || !hpd;
              return (
                <tr key={el.id} className="border-b border-border/50">
                  <td className="py-1 px-2 text-foreground">
                    {qty} × {el.elementName}
                  </td>
                  <td className="text-center py-1 px-2 font-mono">{qty}</td>
                  <td className="text-center py-1 px-2 font-mono">{hpd > 0 ? fmtNum(hpd, 2) : "—"}</td>
                  <td className={`text-center py-1 px-2 font-mono ${incomplete ? "text-muted-foreground/60" : "text-foreground"}`}>
                    {shiftLabel}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="text-[10px] text-muted-foreground italic mt-2">
        Shift end time auto-calculated using CPQ break rules (30-min unpaid break for day shifts &gt; 4.5h within 06:00–18:00).
      </p>
    </div>
  );
};


// ─── Weekend / Detailer Programs Roster ─────────────────────
interface WeekendDetailerRosterProps {
  programs: { id: string; name: string; included: boolean; satApplied: boolean; sunApplied: boolean; hoursPerDay: number }[];
}

const WeekendDetailerRoster: React.FC<WeekendDetailerRosterProps> = ({ programs }) => {
  const items = programs.filter(p => p.included && p.hoursPerDay > 0 && (p.satApplied || p.sunApplied));

  return (
    <div className="border border-border rounded-lg bg-card p-4">
      <h2 className="text-sm font-semibold text-foreground mb-3">Weekend / Detailer Programs Roster</h2>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No Weekend / Detailer programs enabled.
        </p>
      ) : (
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left py-1.5 px-2 text-muted-foreground font-medium">Program</th>
              <th className="text-center py-1.5 px-2 text-muted-foreground font-medium w-16">Qty</th>
              <th className="text-center py-1.5 px-2 text-muted-foreground font-medium w-20">Hrs/Day</th>
              <th className="text-center py-1.5 px-2 text-muted-foreground font-medium w-28">Days</th>
              <th className="text-center py-1.5 px-2 text-muted-foreground font-medium w-32">Shift</th>
            </tr>
          </thead>
          <tbody>
            {items.map(p => {
              const days: string[] = [];
              if (p.satApplied) days.push("Sat");
              if (p.sunApplied) days.push("Sun");
              const end = calcEndTime("06:00", p.hoursPerDay);
              const shiftLabel = end ? `06:00 – ${end}` : "—";
              return (
                <tr key={p.id} className="border-b border-border/50">
                  <td className="py-1 px-2 text-foreground">{p.name}</td>
                  <td className="text-center py-1 px-2 font-mono">1</td>
                  <td className="text-center py-1 px-2 font-mono">{fmtNum(p.hoursPerDay, 2)}</td>
                  <td className="text-center py-1 px-2 font-mono">{days.join(", ")}</td>
                  <td className="text-center py-1 px-2 font-mono text-foreground">{shiftLabel}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
      <p className="text-[10px] text-muted-foreground italic mt-2">
        One casual operator generated per included program. Auto-Generate Operators creates these as Casual / Level&nbsp;1, Cleaning division, starting 06:00.
      </p>
    </div>
  );
};

export default SuggestedRoster;

