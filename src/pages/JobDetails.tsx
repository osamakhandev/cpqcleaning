import { useState, useMemo, useRef, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import html2canvas from "html2canvas";
import { toast } from "sonner";
import { useDraggable } from "@/hooks/useDraggable";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import HowItWorks from "@/components/HowItWorks";
import { HELP_CONTENT } from "@/data/helpContent";
import {
  usePricingData,
  AUSTRALIAN_STATES,
  PAYROLL_TAX_THRESHOLDS,
  type AustralianState,
  type SundryRateSource,
  type PliRateSource,
} from "@/hooks/usePricingData";
import { useRosterStore } from "@/contexts/RosterContext";
import type { LeapYearChargeResult } from "@/lib/leapYearCharge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ExternalLink, MapPin, ChevronDown, Info, GripHorizontal, RotateCcw } from "lucide-react";
import { PageActions } from "@/components/PageActions";
import cpqLogo from "@/assets/cpq-logo.png";
import { SERVICE_LABELS } from "@/types/roster";
import type { ServiceType } from "@/types/roster";
import { usePlan } from "@/contexts/PlanContext";
import { LockedOverlay } from "@/components/plan/LockedOverlay";

/* ── Minimum engagement logic ──────────────────────────────────── */

function getMinimumEngagement(areaStr: string): string | null {
  const area = parseFloat(areaStr.replace(/,/g, ""));
  if (isNaN(area) || areaStr.trim() === "") return null;

  if (area <= 300) return "1 hour";
  if (area <= 2000) return "2 consecutive hours";
  if (area < 5000) return "3 consecutive hours";
  return "4 consecutive hours";
}

const JobDetails = () => {
  const {
    jobDetails,
    updateJobDetails,
    setJobState,
    contractTotalAnnual,
    leapYearCharge,
    year1Factor,
    computedYear1Factor,
    forecastJulyFactor,
    statutoryRates,
    updateStatutoryRate,
    statutoryCalc,
    statutoryTotal,
    pliRow,
    pliError,
    PAYROLL_TAX_RATES: PT_RATES,
    sundryCalc,
    sundryItems,
    sundryTotalValue,
    sundryTotalPct,
    setSundrySource,
    setSundryCustomPct,
    adminRates,
    updateAdminRate,
    adminTotalPct,
    adminError,
    fmt,
    fmtPct,
    grandTotals,
    hasLabourData,
    totalPerWeek,
  } = usePricingData();
  const { operators } = useRosterStore();
  const { hasAccess } = usePlan();
  const canEditFixedPrice = hasAccess("fixed_price");
  const fixedPriceLocked = jobDetails.contractPriceCondition === "Fixed Price" && !canEditFixedPrice;
  const isMobile = useIsMobile();
  const [areaFocused, setAreaFocused] = useState(false);
  const [statutoryOpen, setStatutoryOpen] = useState(true);
  const [sundryOpen, setSundryOpen] = useState(true);
  const [trackerCollapsed, setTrackerCollapsed] = useState(false);
  const { elRef: trackerRef, style: trackerStyle, dragHandleProps, resetPosition } = useDraggable();
  const captureRef = useRef<HTMLDivElement>(null);

  const handleCopyAsImage = useCallback(async () => {
    if (!captureRef.current) return;
    const el = captureRef.current;

    // Add class to force export styling
    el.classList.add("job-details-export");
    try {
      const canvas = await html2canvas(el, {
        scale: 2,
        backgroundColor: "#ffffff",
        useCORS: true,
        logging: false,
        windowWidth: el.scrollWidth,
        windowHeight: el.scrollHeight,
      });
      el.classList.remove("job-details-export");

      canvas.toBlob(async (blob) => {
        if (!blob) {
          toast.error("Failed to generate image");
          return;
        }
        try {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          toast.success("Copied to clipboard");
        } catch {
          // Fallback: download
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = `${jobDetails.jobBuildingName || "Job-Details"}.png`;
          a.click();
          URL.revokeObjectURL(url);
          toast.success("Downloaded as image");
        }
      }, "image/png");
    } catch {
      el.classList.remove("job-details-export");
      toast.error("Failed to capture image");
    }
  }, [jobDetails.jobBuildingName]);

  const jobState = jobDetails.jobState;
  const hasTotal = hasLabourData && contractTotalAnnual > 0;

  const formatArea = (v: string) => {
    const raw = v.replace(/,/g, "");
    if (!raw) return "";
    const parts = raw.split(".");
    parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return parts.join(".");
  };

  const googleMapsUrl = jobDetails.customer
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(jobDetails.customer)}`
    : null;

  const minEngagement = getMinimumEngagement(jobDetails.cleaningArea);

  // Services that currently have operators allocated
  const servicesWithOps = useMemo<ServiceType[]>(() => {
    const ORDER: ServiceType[] = ["cleaning", "security", "customer-service", "maintenance", "management", "landscape"];
    const seen = new Set(operators.map((op) => op.service as ServiceType));
    return ORDER.filter((s) => seen.has(s));
  }, [operators]);

  // Toggle a service in phIncludedServices
  const togglePHService = (svc: ServiceType) => {
    const current = jobDetails.phIncludedServices ?? [];
    const next = current.includes(svc) ? current.filter((s) => s !== svc) : [...current, svc];
    updateJobDetails({ phIncludedServices: next });
  };

  const cellCls = "text-right px-2.5 py-1.5 font-mono text-xs align-middle";
  const labelCls = "px-2.5 py-1.5 text-xs align-middle";
  const headCls = "px-3 py-2 text-xs font-semibold text-center align-middle";

  // Format value or show blank if no labour data
  const fmtOrBlank = (val: number) => (hasLabourData ? fmt(val) : "");

  return (
    <div className="space-y-4 max-w-[1400px] mx-auto" ref={captureRef}>
      {/* ── Page heading ──────────────────────────────────── */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-start gap-3">
          <div>
            <h1 className="text-xl font-bold text-foreground tracking-tight">Start Here — Job Setup</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Complete this section first, then proceed to Roster and Pricing.
            </p>
            <p className="text-xs text-muted-foreground/70 mt-0.5">Open or create a Job to begin</p>
          </div>
          <HowItWorks {...HELP_CONTENT["job-details"]} size="sm" />
        </div>
        <PageActions showPrint onCopyImage={handleCopyAsImage} showCopyImage />
      </div>

      {/* ── Client / Company + Channel row ─────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        <FormRow label="Client / Company">
          <Input
            value={jobDetails.clientName}
            onChange={(e) => updateJobDetails({ clientName: e.target.value })}
            placeholder="Enter client name"
            className="bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)] text-base font-semibold"
          />
        </FormRow>
        <FormRow label="Channel">
          <Select value={jobDetails.channel || ""} onValueChange={(v) => updateJobDetails({ channel: v })}>
            <SelectTrigger className="bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)]">
              <SelectValue placeholder="Select channel…" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Commercial">Commercial</SelectItem>
              <SelectItem value="Retail">Retail</SelectItem>
              <SelectItem value="Education (large facilities)">Education (large facilities)</SelectItem>
              <SelectItem value="Schools">Schools</SelectItem>
              <SelectItem value="Industrial">Industrial</SelectItem>
              <SelectItem value="Events / Venues">Events / Venues</SelectItem>
              <SelectItem value="Government">Government</SelectItem>
              <SelectItem value="Public Outdoor Spaces">Public Outdoor Spaces</SelectItem>
            </SelectContent>
          </Select>
        </FormRow>
      </div>

      {/* ── Job details form ────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-4">
        {/* Left column */}
        <div className="space-y-3">
          <FormRow label="Date">
            <Input
              type="date"
              value={jobDetails.date}
              onChange={(e) => updateJobDetails({ date: e.target.value })}
              className="bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)]"
            />
          </FormRow>
          <FormRow label="State or territory">
            <Select value={jobDetails.jobState} onValueChange={(v) => setJobState(v as AustralianState)}>
              <SelectTrigger className="bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-popover z-50">
                {AUSTRALIAN_STATES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </FormRow>
        </div>

        {/* Right column */}
        <div className="space-y-3">
          <FormRow label="Job or building name">
            <Input
              value={jobDetails.jobBuildingName}
              onChange={(e) => updateJobDetails({ jobBuildingName: e.target.value })}
              placeholder="e.g. Westfield Burwood"
              className="bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)]"
            />
          </FormRow>
          <div className="flex gap-3 items-end">
            <div className="flex-1">
              <FormRow label="Address">
                <Input
                  value={jobDetails.customer}
                  onChange={(e) => updateJobDetails({ customer: e.target.value })}
                  placeholder="e.g. 123 Main St, Sydney NSW 2000"
                  className="bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)]"
                />
              </FormRow>
            </div>
            <div className="shrink-0">
              {googleMapsUrl ? (
                <a
                  href={googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-4 h-10 rounded-md bg-[hsl(220,60%,70%)] hover:bg-[hsl(220,60%,60%)] text-white font-medium text-sm transition-colors"
                >
                  <MapPin className="h-4 w-4" />
                  Map
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              ) : (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-2 px-4 h-10 rounded-md bg-muted text-muted-foreground text-sm cursor-not-allowed">
                        <MapPin className="h-4 w-4" />
                        Map
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>Enter address to enable map</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* 6-box single row: Label + Input × 3 */}
      {/* 4-field row: GFA | Contract Start Date | Tender Due Date | Forecast July Increase */}
      <div className="flex flex-col sm:flex-row sm:items-end gap-3">
        {/* GFA — compact */}
        <div className="flex items-end gap-2 w-full sm:w-[200px] shrink-0">
          <label className="shrink-0 h-10 flex items-center text-sm font-medium text-foreground whitespace-nowrap gap-1">
            GFA
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                </TooltipTrigger>
                <TooltipContent>
                  <p>GFA = Gross Floor Area</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </label>
          <div className="relative flex-1 min-w-0">
            <Input
              value={areaFocused ? jobDetails.cleaningArea : formatArea(jobDetails.cleaningArea)}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9.]/g, "");
                updateJobDetails({ cleaningArea: raw });
              }}
              onFocus={() => setAreaFocused(true)}
              onBlur={() => setAreaFocused(false)}
              placeholder="155,000"
              className="bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)] h-10 pr-10"
            />
            <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
              m²
            </span>
          </div>
        </div>
        {/* Contract Start Date — prominent */}
        <div className="flex items-end gap-2 flex-[2] min-w-0">
          <label className="shrink-0 h-10 flex items-center text-sm font-semibold text-foreground whitespace-nowrap">
            Contract Start Date
          </label>
          <Input
            type="date"
            value={jobDetails.contractCommencementMonth}
            onChange={(e) => updateJobDetails({ contractCommencementMonth: e.target.value })}
            className="bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)] h-10 flex-1 min-w-[170px]"
          />
        </div>
        {/* Tender Due Date */}
        <div className="flex items-end gap-2 flex-[2] min-w-0">
          <label className="shrink-0 h-10 flex items-center text-sm font-medium text-foreground whitespace-nowrap">
            Tender Due Date
          </label>
          <Input
            type="date"
            value={jobDetails.tenderDueDate}
            onChange={(e) => updateJobDetails({ tenderDueDate: e.target.value })}
            className="bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)] h-10 flex-1 min-w-[170px]"
          />
        </div>
        {/* Forecast July Increase — compact, disabled when not applicable */}
        {(() => {
          const startDate = jobDetails.contractCommencementMonth;
          const now = new Date();
          const nextJuly = new Date(now.getMonth() >= 6 ? now.getFullYear() + 1 : now.getFullYear(), 6, 1);
          const isAfterNextJuly = startDate ? new Date(startDate) >= nextJuly : false;
          const hasStartDate = !!startDate;
          const isEnabled = hasStartDate && isAfterNextJuly;

          return (
            <div className="flex items-end gap-2 w-full sm:w-[240px] shrink-0">
              <label
                className={`shrink-0 h-10 flex items-center text-sm font-medium whitespace-nowrap gap-1 ${isEnabled ? "text-foreground" : "text-muted-foreground"}`}
              >
                Forecast July
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs">
                      <p>
                        Forecast July Increase (%) is used only when the contract starts after the next July wage
                        review. It allows you to estimate the expected wage increase before the contract begins, so
                        pricing can start from the forecast post-July rate instead of today's rate.
                      </p>
                      {!isEnabled && (
                        <p className="mt-1 text-muted-foreground italic">
                          {!hasStartDate
                            ? "Enter a Contract Start Date to determine applicability."
                            : "Not applicable — contract starts before next July."}
                        </p>
                      )}
                      {isEnabled && forecastJulyFactor !== 1 && (
                        <p className="mt-1 font-medium">Applied factor: {forecastJulyFactor.toFixed(4)}</p>
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </label>
              <div className="relative flex-1 min-w-0">
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  value={isEnabled ? jobDetails.forecastJulyIncrease || "" : ""}
                  onChange={(e) => updateJobDetails({ forecastJulyIncrease: parseFloat(e.target.value) || 0 })}
                  placeholder={isEnabled ? "0.00" : "N/A"}
                  disabled={!isEnabled}
                  className={`h-10 pr-8 text-right ${isEnabled ? "bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)]" : "bg-muted border-border text-muted-foreground cursor-not-allowed"}`}
                />
                <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
                  %
                </span>
              </div>
            </div>
          );
        })()}
      </div>

      {/* Minimum engagement note — only shown after GFA is entered */}
      {minEngagement && (
        <div className="pl-1 flex items-center gap-2">
          <Info className="h-3.5 w-3.5 text-[hsl(220,60%,35%)] shrink-0" />
          <p className="text-xs text-[hsl(220,60%,35%)] font-medium">Minimum engagement: {minEngagement}</p>
        </div>
      )}

      {/* ── Lower section: PH questions + Term ─────────────────── */}
      <div className="mt-2 space-y-4">
        {/* Public holiday questions — boxed style */}
        <div className="rounded border border-border overflow-hidden">
          <BoxedYesNoRow
            label="Are Public Holidays included in this contract?"
            value={jobDetails.publicHolidayIncluded}
            onChange={(v) => {
              const updates: Record<string, unknown> = { publicHolidayIncluded: v };
              // Reset Sunday roster when turning PH off
              if (v === false || v === null) {
                updates.sundayRosterForPublicHolidays = null;
              }
              updateJobDetails(updates);
              // Default: select all services with operators when turning on
              if (v === true && (!jobDetails.phIncludedServices || jobDetails.phIncludedServices.length === 0)) {
                updateJobDetails({ phIncludedServices: servicesWithOps });
              }
            }}
          />
          {/* PH guidance note + services selector — only when PH is included */}
          {jobDetails.publicHolidayIncluded === true && (
            <div className="border-t border-border px-4 py-3 bg-background">
              <div className="flex items-start gap-2 mb-3 rounded bg-amber-50 border border-amber-200 px-3 py-2">
                <Info className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <span className="text-xs text-amber-800">
                  Public Holidays selected. Please complete the selection of applicable Public Holidays on the{" "}
                  <strong>Other Services &amp; Costs</strong> page.
                </span>
              </div>
              <div className="flex items-start gap-4 flex-wrap">
                <span className="text-xs font-medium text-foreground whitespace-nowrap pt-0.5 min-w-[180px]">
                  Select services to be included (PH coverage)
                </span>
                <div className="flex flex-wrap gap-x-5 gap-y-2">
                  {servicesWithOps.map((svc) => (
                    <label key={svc} className="flex items-center gap-1.5 cursor-pointer">
                      <Checkbox
                        checked={(jobDetails.phIncludedServices ?? []).includes(svc)}
                        onCheckedChange={() => togglePHService(svc)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="text-xs">{SERVICE_LABELS[svc]}</span>
                    </label>
                  ))}
                  {servicesWithOps.length === 0 && (
                    <span className="text-xs text-muted-foreground italic">No services with operators yet.</span>
                  )}
                </div>
              </div>
            </div>
          )}
          {jobDetails.publicHolidayIncluded === true && (
            <BoxedYesNoRow
              label="Is Sunday roster to be used for public holidays?"
              value={jobDetails.sundayRosterForPublicHolidays}
              onChange={(v) => updateJobDetails({ sundayRosterForPublicHolidays: v })}
              isLast
            />
          )}
        </div>

        {/* Term of Contract + Year-1 Factor row */}
        <div
          className={`grid gap-4 ${jobDetails.contractPriceCondition === "Fixed Price" ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1 max-w-xl"}`}
        >
          {/* Term of Contract */}
          <div className="rounded border border-border overflow-hidden">
            <div className="bg-[hsl(200,20%,92%)] px-3 py-2 text-center font-semibold text-sm border-b border-border">
              Term of Contract
            </div>
            <div className="p-3">
              <div className="grid grid-cols-2 gap-3">
                <FormRowStacked label="Length of Contract">
                  <Select
                    value={String(jobDetails.contractLengthYears)}
                    onValueChange={(v) => updateJobDetails({ contractLengthYears: Number(v) })}
                  >
                    <SelectTrigger className="bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)] h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                        <SelectItem key={n} value={String(n)}>
                          {n} Year{n > 1 ? "s" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </FormRowStacked>
                <FormRowStacked label="Condition of Contract Price">
                  <Select
                    value={jobDetails.contractPriceCondition}
                    onValueChange={(v) => updateJobDetails({ contractPriceCondition: v as any })}
                  >
                    <SelectTrigger className="bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)] h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="bg-popover z-50">
                      <SelectItem value="Fixed Price">Fixed Price</SelectItem>
                      <SelectItem value="CPI">CPI</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </FormRowStacked>
                <FormRowStacked label="Fixed contract years">
                  <Input
                    type="number"
                    min={0}
                    max={10}
                    value={jobDetails.fixedYears}
                    onChange={(e) => updateJobDetails({ fixedYears: Number(e.target.value) })}
                    className={`bg-[hsl(48,80%,90%)] h-10 ${jobDetails.fixedYears > jobDetails.contractLengthYears ? "border-destructive" : "border-[hsl(48,50%,70%)]"}`}
                  />
                </FormRowStacked>
              </div>
              {jobDetails.fixedYears > jobDetails.contractLengthYears && (
                <p className="text-xs text-destructive mt-1">
                  Fixed contract years cannot be higher than Length of Contract.
                </p>
              )}
            </div>
          </div>

          {/* Year-1 Factor — only when Fixed Price */}
          {jobDetails.contractPriceCondition === "Fixed Price" && (
            <LockedOverlay
              locked={fixedPriceLocked}
              requiredPlan="advanced"
              featureLabel="Multi-year fixed-price contract modelling"
              banner="🔒 This section was created under Plus — Upgrade to edit or update these values"
            >
              <div className="rounded border border-border overflow-hidden">
                <div className="bg-[hsl(200,20%,92%)] px-3 py-2 text-center font-semibold text-sm border-b border-border">
                  Year-1 Factor
                </div>
                <div className="p-3 space-y-2">
                  <div className="text-xs text-muted-foreground">
                    Computed factor: <strong className="font-mono">{computedYear1Factor.toFixed(6)}</strong>
                    <span className="ml-2 text-muted-foreground/70">
                      (Yr1 rise {(jobDetails.fixedPriceSchedule?.[0]?.increaseForecast ?? 0).toFixed(2)}%, impact{" "}
                      {((computedYear1Factor - 1) * 100).toFixed(2)}%)
                    </span>
                  </div>
                  <div className="text-[11px] text-muted-foreground/60">
                    Saved Yr1 rise used for factor:{" "}
                    {(jobDetails.fixedPriceSchedule?.[0]?.increaseForecast ?? 0).toFixed(2)}%
                  </div>
                  <div className="flex items-center gap-3">
                    <label className="text-xs text-muted-foreground whitespace-nowrap">Manual override:</label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="blank = use computed"
                      value={jobDetails.manualYear1Factor ?? ""}
                      onChange={(e) => {
                        const v = e.target.value;
                        updateJobDetails({ manualYear1Factor: v === "" ? null : parseFloat(v) });
                      }}
                      className="w-44 h-8 text-sm"
                    />
                    {jobDetails.manualYear1Factor !== null && (
                      <button
                        className="text-xs underline text-muted-foreground hover:text-foreground"
                        onClick={() => updateJobDetails({ manualYear1Factor: null })}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="text-xs font-medium text-foreground">
                    Applied factor: <strong className="font-mono">{year1Factor.toFixed(6)}</strong>
                    {jobDetails.manualYear1Factor !== null && <span className="ml-1 text-amber-600">(manual)</span>}
                  </div>
                </div>
              </div>
            </LockedOverlay>
          )}
        </div>

        {/* Fixed Price Schedule */}
        {jobDetails.contractPriceCondition === "Fixed Price" && jobDetails.fixedYears > 0 && (
          <LockedOverlay
            locked={fixedPriceLocked}
            requiredPlan="advanced"
            featureLabel="Multi-year fixed-price contract modelling"
            banner={
              fixedPriceLocked
                ? "🔒 This section was created under Plus — Upgrade to edit or update these values"
                : undefined
            }
          >
            <FixedPriceSchedule
              startDate={jobDetails.contractCommencementMonth}
              fixedYears={jobDetails.fixedYears}
              schedule={jobDetails.fixedPriceSchedule}
              baseAnnualPrice={contractTotalAnnual}
              leapYearCharge={leapYearCharge}
              onUpdateRate={(idx, val) => {
                const next = [...jobDetails.fixedPriceSchedule];
                next[idx] = { ...next[idx], increaseForecast: val };
                updateJobDetails({ fixedPriceSchedule: next });
              }}
            />
          </LockedOverlay>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* A) Statutory On-costs (detailed / editable)            */}
        {/* ═══════════════════════════════════════════════════════ */}
        <Collapsible open={statutoryOpen} onOpenChange={setStatutoryOpen}>
          <div className="rounded border border-border overflow-hidden">
            <CollapsibleTrigger className="w-full flex items-center justify-between bg-[hsl(200,20%,92%)] px-3 py-2 font-semibold text-sm border-b border-border cursor-pointer hover:bg-[hsl(200,20%,88%)] transition-colors">
              <span>Statutory On-costs</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${statutoryOpen ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              {!hasLabourData && (
                <div className="px-3 py-2 bg-muted/20 text-xs text-muted-foreground italic border-b border-border flex items-center gap-2">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  Add operators in Roster to calculate labour and on-costs.
                </div>
              )}
              <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className={`${headCls} text-left w-[35%]`}>Item</th>
                    <th className={`${headCls} w-[100px]`}>Rate %</th>
                    <th className={`${headCls}`}>Base</th>
                    <th className={`${headCls}`}>Annual Value</th>
                  </tr>
                </thead>
                <tbody>
                  {statutoryCalc.map((item, idx) => (
                    <tr key={item.id} className={idx % 2 === 0 ? "bg-background" : "bg-muted/10"}>
                      <td className={labelCls}>
                        <div className="flex flex-col gap-0.5">
                          <div className="flex items-center gap-1.5">
                            <span>{item.label}</span>
                            {item.noteText && (
                              <span className="text-[10px] text-muted-foreground italic">({item.noteText})</span>
                            )}
                            {item.helperText && (
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Info className="h-3 w-3 text-muted-foreground cursor-help flex-shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent className="max-w-xs text-xs">{item.helperText}</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          {item.stateInfo && (
                            <span className="text-[10px] text-muted-foreground">{item.stateInfo}</span>
                          )}
                          {/* Payroll Tax threshold confirmation */}
                          {item.id === "payroll-tax" && (
                            <div className="mt-1.5 p-2 rounded border border-muted bg-muted/20 space-y-1.5">
                              <p className="text-[11px] text-muted-foreground whitespace-nowrap">
                                Is your company's payroll over the payroll tax threshold in <strong>{jobState}</strong>?{" "}
                                (Threshold:{" "}
                                {fmt(PAYROLL_TAX_THRESHOLDS[jobState as keyof typeof PAYROLL_TAX_THRESHOLDS] ?? 0)})
                              </p>
                              <RadioGroup
                                value={
                                  statutoryRates.payrollTaxOverThreshold === true
                                    ? "yes"
                                    : statutoryRates.payrollTaxOverThreshold === false
                                      ? "no"
                                      : "yes"
                                }
                                onValueChange={(v) =>
                                  updateStatutoryRate("payrollTaxOverThreshold", v === "yes" ? true : false)
                                }
                                className="flex items-center gap-4"
                              >
                                <div className="flex items-center gap-1.5">
                                  <RadioGroupItem value="yes" id="pt-yes" className="h-3.5 w-3.5" />
                                  <Label htmlFor="pt-yes" className="text-[11px] cursor-pointer">
                                    Yes
                                  </Label>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <RadioGroupItem value="no" id="pt-no" className="h-3.5 w-3.5" />
                                  <Label htmlFor="pt-no" className="text-[11px] cursor-pointer">
                                    No
                                  </Label>
                                </div>
                              </RadioGroup>
                            </div>
                          )}
                        </div>
                      </td>
                      <td className={cellCls}>
                        {item.editable ? (
                          <Input
                            type="number"
                            step="0.01"
                            min="0"
                            value={
                              item.id === "lsl-cleaning" || item.id === "lsl-security"
                                ? item.pct
                                : getStatutoryInputValue(item.id, statutoryRates)
                            }
                            onChange={(e) => handleStatutoryChange(item.id, e.target.value, updateStatutoryRate)}
                            className="h-6 w-20 text-right text-xs font-mono ml-auto px-1.5 py-0"
                          />
                        ) : (
                          <span>{fmtPct(item.pct)}</span>
                        )}
                      </td>
                      <td className={`${cellCls} text-muted-foreground text-[10px]`}>{item.baseLabel}</td>
                      <td className={cellCls}>{fmtOrBlank(item.value)}</td>
                    </tr>
                  ))}
                  <tr className="border-t border-border bg-muted/40 font-semibold">
                    <td className={`${labelCls} font-semibold`}>Total Statutory On-costs</td>
                    <td className={cellCls}></td>
                    <td className={cellCls}></td>
                    <td className={cellCls}>{fmtOrBlank(statutoryTotal)}</td>
                  </tr>
                </tbody>
              </table>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* B) Sundry Expenses (detailed / editable)               */}
        {/* ═══════════════════════════════════════════════════════ */}
        <Collapsible open={sundryOpen} onOpenChange={setSundryOpen}>
          <div className="rounded border border-border overflow-hidden">
            <CollapsibleTrigger className="w-full flex items-center justify-between bg-[hsl(200,20%,92%)] px-3 py-2 font-semibold text-sm border-b border-border cursor-pointer hover:bg-[hsl(200,20%,88%)] transition-colors">
              <span>Sundry Expenses</span>
              <ChevronDown className={`h-4 w-4 transition-transform ${sundryOpen ? "rotate-180" : ""}`} />
            </CollapsibleTrigger>
            <CollapsibleContent>
              {!hasLabourData && (
                <div className="px-3 py-2 bg-muted/20 text-xs text-muted-foreground italic border-b border-border flex items-center gap-2">
                  <Info className="h-3.5 w-3.5 shrink-0" />
                  Add operators in Roster to calculate labour and on-costs.
                </div>
              )}
              <table className="w-full border-collapse" style={{ tableLayout: "fixed" }}>
                <thead>
                  <tr className="bg-muted/40 border-b border-border">
                    <th className={`${headCls} text-left w-[30%]`}>Item</th>
                    <th className={`${headCls} text-left w-[130px]`}>Rate Source</th>
                    <th className={`${headCls} w-[100px]`}>Rate %</th>
                    <th className={`${headCls}`}>Base</th>
                    <th className={`${headCls}`}>Annual Value</th>
                  </tr>
                </thead>
                <tbody>
                  {sundryCalc.map((item: any, idx: number) => {
                    const baseLabel =
                      item.source === "calculator" ? "From Sundry Expenses Summary" : "Labour Cost + Total Statutory";
                    return (
                      <tr key={item.id} className={idx % 2 === 0 ? "bg-background" : "bg-muted/10"}>
                        <td className={labelCls}>{item.label}</td>
                        <td className={labelCls}>
                          <Select
                            value={item.source}
                            onValueChange={(val: string) => setSundrySource(item.id, val as SundryRateSource)}
                          >
                            <SelectTrigger className="h-6 text-[11px] w-[120px] px-2">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="default" className="text-xs">
                                Default rate
                              </SelectItem>
                              <SelectItem value="custom" className="text-xs">
                                My own rate
                              </SelectItem>
                              <SelectItem value="calculator" className="text-xs">
                                Calculated
                              </SelectItem>
                            </SelectContent>
                          </Select>
                        </td>
                        <td className={cellCls}>
                          {item.source === "custom" ? (
                            <Input
                              type="number"
                              step="0.01"
                              min="0"
                              value={item.customPct}
                              onChange={(e) => setSundryCustomPct(item.id, parseFloat(e.target.value) || 0)}
                              className="h-6 w-20 text-right text-xs font-mono ml-auto px-1.5 py-0"
                            />
                          ) : (
                            <span>{fmtPct(item.pct)}</span>
                          )}
                        </td>
                        <td className={`${cellCls} text-muted-foreground text-[10px]`}>{baseLabel}</td>
                        <td className={cellCls}>{fmtOrBlank(item.value)}</td>
                      </tr>
                    );
                  })}
                  {/* PLI row (special — uses contract-level calculation) */}
                  <tr className={sundryCalc.length % 2 === 0 ? "bg-background" : "bg-muted/10"}>
                    <td className={labelCls}>{pliRow.label}</td>
                    <td className={labelCls}>
                      <Select
                        value={statutoryRates.pliSource || "default"}
                        onValueChange={(val: string) => updateStatutoryRate("pliSource", val as PliRateSource)}
                      >
                        <SelectTrigger className="h-6 text-[11px] w-[120px] px-2">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="default" className="text-xs">
                            Default rate
                          </SelectItem>
                          <SelectItem value="custom" className="text-xs">
                            My own rate
                          </SelectItem>
                          <SelectItem value="quoted" className="text-xs">
                            Quoted value
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </td>
                    <td className={cellCls}>
                      {statutoryRates.pliSource === "custom" ? (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={statutoryRates.pliCustomPct}
                          onChange={(e) => updateStatutoryRate("pliCustomPct", parseFloat(e.target.value) || 0)}
                          className="h-6 w-20 text-right text-xs font-mono ml-auto px-1.5 py-0"
                        />
                      ) : (
                        <span>{fmtPct(pliRow.pct)}</span>
                      )}
                    </td>
                    <td className={`${cellCls} text-muted-foreground text-[10px]`}>{pliRow.baseLabel}</td>
                    <td className={cellCls}>
                      {statutoryRates.pliSource === "quoted" ? (
                        <Input
                          type="number"
                          step="0.01"
                          min="0"
                          value={statutoryRates.pliQuotedValue || ""}
                          onChange={(e) => updateStatutoryRate("pliQuotedValue", parseFloat(e.target.value) || 0)}
                          className="h-6 w-28 text-right text-xs font-mono ml-auto px-1.5 py-0"
                        />
                      ) : pliError ? (
                        "–"
                      ) : (
                        fmtOrBlank(pliRow.value)
                      )}
                    </td>
                  </tr>
                  {pliError && (
                    <tr>
                      <td colSpan={5} className="px-3 py-2 bg-destructive/10 text-destructive text-xs font-medium">
                        PLI rate is too high. Cannot calculate.
                      </td>
                    </tr>
                  )}
                  <tr className="border-t border-border bg-muted/40 font-semibold">
                    <td className={`${labelCls} font-semibold`}>Total Sundry Expenses</td>
                    <td className={labelCls}></td>
                    <td className={cellCls}></td>
                    <td className={`${labelCls} text-muted-foreground`}>—</td>
                    <td className={cellCls}>{fmtOrBlank(sundryTotalValue + (pliError ? 0 : pliRow.value))}</td>
                  </tr>
                </tbody>
              </table>
            </CollapsibleContent>
          </div>
        </Collapsible>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* C) Administration & Profit (editable rates)            */}
        {/* ═══════════════════════════════════════════════════════ */}
        <div className="rounded border border-border overflow-hidden">
          <div className="bg-[hsl(200,20%,92%)] px-3 py-2 font-semibold text-sm border-b border-border">
            Administration & Profit
          </div>
          {adminError && (
            <div className="px-3 py-2 bg-destructive/10 text-destructive text-xs font-medium border-b border-border">
              Total Admin & Profit rate must be less than 100%.
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-3 divide-y sm:divide-y-0 sm:divide-x divide-border">
            {[
              {
                label: jobDetails.adminTrainingLabel || "Administration",
                key: "staffTraining" as const,
                editable: true,
              },
              { label: "Staff Management", key: "staffManagement" as const, editable: false },
              { label: "Profit", key: "profit" as const, editable: false },
            ].map((item) => (
              <div key={item.key} className="flex items-center justify-between gap-2 px-3 py-2.5">
                {item.editable ? (
                  <Input
                    type="text"
                    defaultValue={jobDetails.adminTrainingLabel || "Administration"}
                    key={`admin-label-${jobDetails.adminTrainingLabel}`}
                    onBlur={(e) => {
                      const val = e.target.value.trim() || "Administration";
                      updateJobDetails({ adminTrainingLabel: val });
                      e.target.value = val;
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    className="h-6 text-xs font-medium border-dashed border-muted-foreground/40 bg-transparent px-1 max-w-[120px]"
                    title="Click to rename this label"
                  />
                ) : (
                  <label className="text-xs font-medium text-foreground whitespace-nowrap">{item.label}</label>
                )}
                <div className="relative w-24">
                  <Input
                    type="text"
                    inputMode="decimal"
                    defaultValue={adminRates[item.key].toFixed(2) + "%"}
                    key={`admin-${item.key}-${adminRates[item.key]}`}
                    onFocus={(e) => {
                      e.target.value = String(adminRates[item.key]);
                      e.target.select();
                    }}
                    onBlur={(e) => {
                      const raw = e.target.value.replace(/%/g, "").trim();
                      const num = parseFloat(raw);
                      const final = isNaN(num) ? 0 : num;
                      updateAdminRate(item.key, final);
                      e.target.value = final.toFixed(2) + "%";
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                    }}
                    className="bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)] h-8 text-right text-xs font-mono pr-2"
                  />
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-t border-border">
            <span className="text-xs font-semibold">Total Admin & Profit Rate</span>
            <span className="text-xs font-mono font-semibold">{fmtPct(adminTotalPct)}</span>
          </div>
        </div>
      </div>

      {/* ── Floating Contract Price Tracker ─────────────────── */}
      {isMobile ? (
        /* Bottom-docked bar on mobile */
        <div className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-card shadow-[0_-4px_12px_hsl(var(--foreground)/0.08)]">
          <button
            onClick={() => setTrackerCollapsed((prev) => !prev)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs font-medium text-muted-foreground"
          >
            <span>Total Direct Labour Price Per Annum</span>
            <ChevronDown className={`h-3.5 w-3.5 transition-transform ${trackerCollapsed ? "rotate-180" : ""}`} />
          </button>
          {!trackerCollapsed && (
            <div className="px-4 pb-3 pt-0">
              <p className="text-lg font-bold font-mono text-foreground">{hasTotal ? fmt(contractTotalAnnual) : "—"}</p>
            </div>
          )}
        </div>
      ) : (
        /* Draggable floating card on desktop */
        <div
          ref={trackerRef}
          className="z-50 w-[290px] rounded-lg border-2 border-primary/30 bg-card shadow-[0_8px_30px_hsl(var(--primary)/0.12)] select-none"
          style={trackerStyle}
        >
          {/* Drag handle header */}
          <div
            {...dragHandleProps}
            className="flex items-center justify-between px-4 py-2.5 border-b border-primary/20 rounded-t-lg bg-primary/5"
          >
            <div className="flex items-center gap-1.5 text-primary">
              <GripHorizontal className="h-3.5 w-3.5" />
              <span className="text-[10px] font-semibold uppercase tracking-wider">Price Tracker</span>
            </div>
            <button
              onClick={resetPosition}
              className="p-0.5 rounded hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
              title="Reset position"
            >
              <RotateCcw className="h-3 w-3" />
            </button>
          </div>
          <div className="px-4 py-3">
            <p className="text-[11px] font-medium text-muted-foreground mb-1">Total Direct Labour Price Per Annum</p>
            <p
              className={`text-xl font-bold font-mono leading-tight ${hasTotal ? "text-foreground" : "text-muted-foreground"}`}
            >
              {hasTotal ? fmt(contractTotalAnnual) : "—"}
            </p>
            {!hasTotal && (
              <p className="text-[10px] text-muted-foreground mt-1 italic">Add roster operators to see pricing</p>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default JobDetails;

/* ── Statutory helpers ─────────────────────────────────────── */

function getStatutoryInputValue(id: string, rates: any): number {
  const map: Record<string, string> = {
    anl: "anl",
    "leave-loading": "leaveLoading",
    sl: "sl",
    "lsl-cleaning": "lslCleaningOverride",
    "lsl-security": "lslSecurityOverride",
    "workers-comp": "workersComp",
    "payroll-tax": "payrollTaxOverride",
    pli: "pli",
  };
  const key = map[id];
  if (!key) return 0;
  const val = rates[key];
  if (val === null || val === undefined) return 0;
  return val;
}

function handleStatutoryChange(id: string, rawValue: string, update: (key: any, value: number | null) => void) {
  const map: Record<string, string> = {
    anl: "anl",
    "leave-loading": "leaveLoading",
    sl: "sl",
    "lsl-cleaning": "lslCleaningOverride",
    "lsl-security": "lslSecurityOverride",
    "workers-comp": "workersComp",
    "payroll-tax": "payrollTaxOverride",
    pli: "pli",
  };
  const key = map[id];
  if (!key) return;
  const num = parseFloat(rawValue);
  update(key, isNaN(num) ? 0 : num);
}

/* ── Fixed Price Schedule ──────────────────────────────────── */

function getNextJuly(start: Date): Date {
  const year = start.getMonth() < 6 ? start.getFullYear() : start.getFullYear() + 1; // month 6 = July
  return new Date(year, 6, 1); // July 1
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function addYears(d: Date, n: number): Date {
  return new Date(d.getFullYear() + n, d.getMonth(), d.getDate());
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtCurrency(v: number): string {
  return v.toLocaleString("en-AU", {
    style: "currency",
    currency: "AUD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

interface FixedPriceScheduleProps {
  startDate: string;
  fixedYears: number;
  schedule: { increaseForecast: number }[];
  baseAnnualPrice: number;
  leapYearCharge: LeapYearChargeResult;
  onUpdateRate: (idx: number, val: number) => void;
}

function FixedPriceSchedule({
  startDate,
  fixedYears,
  schedule,
  baseAnnualPrice,
  leapYearCharge,
  onUpdateRate,
}: FixedPriceScheduleProps) {
  const [leapExpanded, setLeapExpanded] = useState(false);
  const rows = useMemo(() => {
    if (!startDate) return null;
    const start = new Date(startDate);
    if (isNaN(start.getTime())) return null;

    const july = getNextJuly(start);
    const n = Math.min(fixedYears, 10);
    const result: {
      year: number;
      startDate: Date;
      endDate: Date;
      risePercent: number;
      isImpactRate?: boolean;
      daysPreJuly: number | null;
      daysPostJuly: number | null;
      annualPrice: number;
    }[] = [];

    for (let i = 0; i < n; i++) {
      const yStart = addYears(start, i);
      const yEnd = new Date(addYears(start, i + 1).getTime() - 86400000);
      const r = (schedule[i]?.increaseForecast ?? 0) / 100;

      if (i === 0) {
        const daysPreJuly = daysBetween(start, july);
        const anniversary = addYears(start, 1);
        const daysPostJuly = daysBetween(july, anniversary);
        const totalDays = daysPreJuly + daysPostJuly;

        // baseAnnualPrice already includes the Year-1 impact factor from the
        // central pricing engine – do NOT re-apply it here.
        const impactRate = totalDays > 0 ? r * (daysPostJuly / totalDays) : r;

        result.push({
          year: 1,
          startDate: yStart,
          endDate: yEnd,
          risePercent: impactRate * 100,
          isImpactRate: true,
          daysPreJuly,
          daysPostJuly,
          annualPrice: baseAnnualPrice,
        });
      } else {
        const prevPrice = result[i - 1].annualPrice;
        result.push({
          year: i + 1,
          startDate: yStart,
          endDate: yEnd,
          risePercent: schedule[i]?.increaseForecast ?? 0,
          daysPreJuly: null,
          daysPostJuly: null,
          annualPrice: prevPrice * (1 + r),
        });
      }
    }
    return result;
  }, [startDate, fixedYears, schedule, baseAnnualPrice]);

  const n = Math.min(fixedYears, 10);

  return (
    <div className="rounded border border-border overflow-hidden">
      <div className="bg-[hsl(200,20%,92%)] px-3 py-2 text-center font-semibold text-sm border-b border-border">
        Fixed Price Schedule
      </div>
      <div className="p-3 space-y-3">
        {/* Wage rise inputs */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
          {Array.from({ length: n }, (_, i) => {
            const val = schedule[i]?.increaseForecast ?? 0;
            return (
              <div key={i} className="flex flex-col gap-1">
                <label className="text-xs font-medium text-muted-foreground text-center">Yr {i + 1} rise %</label>
                <Input
                  type="text"
                  inputMode="decimal"
                  defaultValue={val.toFixed(2) + "%"}
                  key={`yr-${i}-${val}`}
                  onFocus={(e) => {
                    e.target.value = String(val);
                    e.target.select();
                  }}
                  onBlur={(e) => {
                    const raw = e.target.value.replace(/%/g, "").trim();
                    const num = parseFloat(raw);
                    const final = isNaN(num) ? 0 : num;
                    onUpdateRate(i, final);
                    e.target.value = final.toFixed(2) + "%";
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") e.currentTarget.blur();
                  }}
                  className="bg-[hsl(48,80%,90%)] border-[hsl(48,50%,70%)] h-8 text-center text-sm"
                />
              </div>
            );
          })}
        </div>

        {/* Year 1 days split summary */}
        {rows && rows[0] && rows[0].daysPreJuly !== null && (
          <div className="flex gap-3 items-center">
            <div className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(48,80%,90%)] border border-[hsl(48,50%,70%)] px-3 py-1.5 text-sm font-medium">
              <span className="text-muted-foreground">Days pre 1 July:</span>
              <span className="font-semibold">{rows[0].daysPreJuly}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-[hsl(48,80%,90%)] border border-[hsl(48,50%,70%)] px-3 py-1.5 text-sm font-medium">
              <span className="text-muted-foreground">Days post 1 July:</span>
              <span className="font-semibold">{rows[0].daysPostJuly}</span>
            </div>
          </div>
        )}

        {/* Schedule table */}
        {rows ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="bg-[hsl(48,30%,92%)] text-xs font-medium">
                  <th className="border border-border px-2 py-1.5 text-center">Year</th>
                  <th className="border border-border px-2 py-1.5 text-center">Start Date</th>
                  <th className="border border-border px-2 py-1.5 text-center">End Date</th>
                  <th className="border border-border px-2 py-1.5 text-center">Wage Rise %</th>
                  <th className="border border-border px-2 py-1.5 text-center">Annual Price</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.year} className={row.year === 1 ? "bg-[hsl(48,80%,95%)]" : ""}>
                    <td className="border border-border px-2 py-1.5 text-center font-medium">{row.year}</td>
                    <td className="border border-border px-2 py-1.5 text-center">{fmtDate(row.startDate)}</td>
                    <td className="border border-border px-2 py-1.5 text-center">{fmtDate(row.endDate)}</td>
                    <td className="border border-border px-2 py-1.5 text-center">
                      {row.risePercent.toFixed(2)}%
                      {row.isImpactRate && (
                        <span className="block text-[10px] text-muted-foreground italic">
                          impact rate (1 July split)
                        </span>
                      )}
                    </td>
                    <td className="border border-border px-2 py-1.5 text-right font-medium">
                      {fmtCurrency(row.annualPrice)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">Enter a Contract Start Date to generate the schedule.</p>
        )}

        {/* ── Leap Year Charge ────────────────────────────────── */}
        {leapYearCharge.applicable && (
          <div className="rounded border border-border overflow-hidden">
            <div className="flex items-center justify-between bg-[hsl(48,30%,92%)] px-3 py-2 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm">Leap Year Charge</span>
                <div className="group relative">
                  <Info className="h-3.5 w-3.5 text-muted-foreground cursor-help" />
                  <div className="absolute left-0 bottom-full mb-1 w-72 rounded bg-foreground text-background text-xs p-2 hidden group-hover:block z-50 shadow-lg">
                    Adds the cost of an extra service day for 29 February when it falls within the fixed contract period
                    and the roster includes service on that day.
                  </div>
                </div>
              </div>
              <span className="font-semibold text-sm font-mono">{fmtCurrency(leapYearCharge.totalCharge)}</span>
            </div>

            {leapYearCharge.leapDays.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setLeapExpanded(!leapExpanded)}
                  className="flex items-center gap-1 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-full"
                >
                  <ChevronDown className={`h-3 w-3 transition-transform ${leapExpanded ? "rotate-180" : ""}`} />
                  {leapExpanded ? "Hide" : "Show"} breakdown ({leapYearCharge.leapDays.length} leap day
                  {leapYearCharge.leapDays.length !== 1 ? "s" : ""})
                </button>

                {leapExpanded && (
                  <div className="px-3 pb-2">
                    <table className="w-full text-xs border-collapse">
                      <thead>
                        <tr className="bg-[hsl(48,30%,92%)] text-xs font-medium">
                          <th className="border border-border px-2 py-1 text-left">Date</th>
                          <th className="border border-border px-2 py-1 text-center">Weekday</th>
                          <th className="border border-border px-2 py-1 text-center">Worked?</th>
                          <th className="border border-border px-2 py-1 text-right">Daily Cost</th>
                          <th className="border border-border px-2 py-1 text-right">Charge</th>
                        </tr>
                      </thead>
                      <tbody>
                        {leapYearCharge.leapDays.map((ld) => (
                          <tr key={ld.dateISO} className={ld.worked ? "bg-[hsl(48,80%,95%)]" : ""}>
                            <td className="border border-border px-2 py-1">{ld.date}</td>
                            <td className="border border-border px-2 py-1 text-center">{ld.weekdayLabel}</td>
                            <td className="border border-border px-2 py-1 text-center font-medium">
                              {ld.worked ? "Y" : "N"}
                            </td>
                            <td className="border border-border px-2 py-1 text-right font-mono">
                              {ld.worked ? fmtCurrency(ld.dailyCost) : "—"}
                            </td>
                            <td className="border border-border px-2 py-1 text-right font-mono font-medium">
                              {ld.charge > 0 ? fmtCurrency(ld.charge) : "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="bg-[hsl(200,20%,92%)] font-semibold">
                          <td colSpan={4} className="border border-border px-2 py-1 text-right">
                            Total Leap Year Charge
                          </td>
                          <td className="border border-border px-2 py-1 text-right font-mono">
                            {fmtCurrency(leapYearCharge.totalCharge)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>
            )}

            {leapYearCharge.leapDays.length === 0 && (
              <div className="px-3 py-2 text-xs text-muted-foreground italic">
                No 29 February dates fall within the contract period.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ── Helpers ───────────────────────────────────────────────── */

function SectionBand({ title }: { title: string }) {
  return (
    <div className="rounded border border-[hsl(120,25%,75%)] bg-[hsl(120,40%,94%)] px-4 py-2 text-center">
      <span className="font-semibold text-sm">{title}</span>
    </div>
  );
}

/** Inline label + input (original style) */
function FormRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3">
      <div className="rounded border border-border bg-[hsl(48,30%,92%)] px-3 py-2 text-xs font-medium w-[160px] shrink-0 text-right">
        {label}
      </div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

/** Stacked label above input — equal-width columns */
function FormRowStacked({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="rounded border border-border bg-[hsl(48,30%,92%)] px-3 py-2 text-xs font-medium text-center">
        {label}
      </div>
      <div>{children}</div>
    </div>
  );
}

/** Boxed Yes/No row matching form style */
function BoxedYesNoRow({
  label,
  value,
  onChange,
  isLast,
}: {
  label: string;
  value: boolean | null;
  onChange: (v: boolean) => void;
  isLast?: boolean;
}) {
  return (
    <div className={`flex items-center gap-3 p-2 ${!isLast ? "border-b border-border" : ""}`}>
      <div className="rounded border border-border bg-[hsl(48,30%,92%)] px-3 py-2 text-xs font-medium flex-1">
        {label}
      </div>
      <div className="rounded border border-border bg-[hsl(48,80%,90%)] px-3 py-2 min-w-[120px] flex justify-center">
        <RadioGroup
          value={value === true ? "yes" : value === false ? "no" : ""}
          onValueChange={(v) => onChange(v === "yes")}
          className="flex gap-3"
        >
          <div className="flex items-center gap-1">
            <RadioGroupItem value="yes" id={`${label}-yes`} />
            <Label htmlFor={`${label}-yes`} className="text-xs">
              Yes
            </Label>
          </div>
          <div className="flex items-center gap-1">
            <RadioGroupItem value="no" id={`${label}-no`} />
            <Label htmlFor={`${label}-no`} className="text-xs">
              No
            </Label>
          </div>
        </RadioGroup>
      </div>
    </div>
  );
}
