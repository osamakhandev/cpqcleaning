import { useMemo, useState } from "react";
import { Settings2 } from "lucide-react";
import { FeatureGate } from "@/components/plan/FeatureGate";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Button } from "@/components/ui/button";
import { useWageSettings, calculateBaseHourly, getWageHourlyRates, type WageServiceConfig } from "@/lib/wageSettings";
import type { OperatorLevel } from "@/types/roster";

const levelLabels: Record<OperatorLevel, string> = {
  "level-1": "Level 1",
  "level-2": "Level 2",
  "level-3": "Level 3",
  "level-4": "Level 4",
  "level-5": "Level 5",
};

const LEVELS: OperatorLevel[] = ["level-1", "level-2", "level-3", "level-4", "level-5"];

const formatCurrency = (val: number) =>
  val > 0 ? "$" + val.toLocaleString("en-AU", { minimumFractionDigits: 0, maximumFractionDigits: 0 }) : "";

function WageInput({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  const [editing, setEditing] = useState(false);
  const [raw, setRaw] = useState("");

  const handleFocus = () => {
    setEditing(true);
    setRaw(value > 0 ? String(value) : "");
  };

  const handleBlur = () => {
    setEditing(false);
    const parsed = parseFloat(raw.replace(/[^0-9.]/g, "")) || 0;
    onChange(parsed);
  };

  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Input
        type="text"
        inputMode="numeric"
        value={editing ? raw : formatCurrency(value)}
        onFocus={handleFocus}
        onChange={(e) => setRaw(e.target.value)}
        onBlur={handleBlur}
        placeholder="e.g. $70,000"
        className="font-mono"
      />
    </div>
  );
}

function ServiceWageConfig({
  label,
  serviceKey,
  config,
  onUpdateWage,
  onUpdateLoading,
}: {
  label: string;
  serviceKey: "maintenance" | "management";
  config: WageServiceConfig;
  onUpdateWage: (service: "maintenance" | "management", level: OperatorLevel, wage: number) => void;
  onUpdateLoading: (
    service: "maintenance" | "management",
    key: keyof WageServiceConfig["loadings"],
    value: number,
  ) => void;
}) {
  const ratesByLevel = useMemo(() => {
    return LEVELS.map((level) => ({
      level,
      annualWage: config.levels[level],
      rates: getWageHourlyRates(config.levels[level], config.loadings),
    }));
  }, [config]);

  return (
    <div className="space-y-4">
      <h4 className="font-semibold text-sm">{label}</h4>

      {/* Annual Wage inputs */}
      <div className="grid grid-cols-3 gap-4">
        {LEVELS.map((level) => (
          <WageInput
            key={level}
            label={`${levelLabels[level]} Annual Wage`}
            value={config.levels[level]}
            onChange={(val) => onUpdateWage(serviceKey, level, val)}
          />
        ))}
      </div>

      {/* Loading multipliers */}
      <div className="grid grid-cols-4 gap-4">
        {(
          [
            ["afterHours", "After Hours (18:00–06:00)"],
            ["saturday", "Saturday"],
            ["sunday", "Sunday"],
            ["publicHoliday", "Public Holiday"],
          ] as [keyof WageServiceConfig["loadings"], string][]
        ).map(([key, lbl]) => (
          <div key={key} className="space-y-1">
            <Label className="text-xs text-muted-foreground">{lbl} ×</Label>
            <Input
              type="number"
              min={0}
              step={0.05}
              value={config.loadings[key]}
              onChange={(e) => onUpdateLoading(serviceKey, key, parseFloat(e.target.value) || 0)}
              className="font-mono"
            />
          </div>
        ))}
      </div>

      {/* Live hourly-rate table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-28">Level</TableHead>
            <TableHead className="text-right">Base $/hr</TableHead>
            <TableHead className="text-right">After Hrs</TableHead>
            <TableHead className="text-right">Saturday</TableHead>
            <TableHead className="text-right">Sunday</TableHead>
            <TableHead className="text-right">Public Hol.</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {ratesByLevel.map(({ level, annualWage, rates }) => (
            <TableRow key={level}>
              <TableCell className="font-medium">{levelLabels[level]}</TableCell>
              <TableCell className="text-right font-mono">
                {annualWage > 0
                  ? "$" + rates.base.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : "—"}
              </TableCell>
              <TableCell className="text-right font-mono">
                {annualWage > 0
                  ? "$" +
                    rates.afterHours.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : "—"}
              </TableCell>
              <TableCell className="text-right font-mono">
                {annualWage > 0
                  ? "$" + rates.saturday.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : "—"}
              </TableCell>
              <TableCell className="text-right font-mono">
                {annualWage > 0
                  ? "$" + rates.sunday.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : "—"}
              </TableCell>
              <TableCell className="text-right font-mono">
                {annualWage > 0
                  ? "$" +
                    rates.publicHoliday.toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : "—"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export function WageSettingsPanel() {
  const { settings, isLoaded, updateLevelWage, updateLoading } = useWageSettings();

  if (!isLoaded) return null;

  return (
    <Collapsible>
      <Card>
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <CardTitle className="flex items-center gap-2 text-base">
              <Settings2 className="h-4 w-4" />
              Maintenance & Management Wage Settings
            </CardTitle>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-6 pt-0">
            <FeatureGate feature="maintenance" featureLabel="Maintenance & Management Wage Settings">
              <p className="text-sm text-muted-foreground">
                Enter annual wages and loading multipliers. Hourly rates update live below. Base hourly = Annual Wage ÷
                1,981.32 (52.14 weeks × 38 hrs).
              </p>
              <ServiceWageConfig
                label="Maintenance"
                serviceKey="maintenance"
                config={settings.maintenance}
                onUpdateWage={updateLevelWage}
                onUpdateLoading={updateLoading}
              />
              <div className="border-t" />
              <ServiceWageConfig
                label="Management"
                serviceKey="management"
                config={settings.management}
                onUpdateWage={updateLevelWage}
                onUpdateLoading={updateLoading}
              />
            </FeatureGate>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
}
