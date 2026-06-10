import { useMemo, useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import cpqLogo from "@/assets/cpq-logo.png";
import { useRosterStoreOptional } from "@/contexts/RosterContext";
import { useProjectStatus } from "@/contexts/ProjectStatusContext";
import {
  Cloud,
  CloudOff,
  Loader2,
  FolderOpen,
  Lock,
  LogOut,
  User as UserIcon,
  CreditCard,
  ArrowUpCircle,
  ExternalLink,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/contexts/AuthContext";
import { usePlan } from "@/contexts/PlanContext";
import { PLAN_LABELS } from "@/lib/featureAccess";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

import type { ServiceType } from "@/types/roster";

const JOB_DETAILS_KEY = "cpq-job-details";

const SERVICE_CODES: Record<ServiceType, string> = {
  cleaning: "CLN",
  security: "SEC",
  "customer-service": "CS",
  management: "MGT",
  maintenance: "MTC",
  landscape: "LND",
};

const SERVICE_ORDER: ServiceType[] = [
  "cleaning",
  "security",
  "customer-service",
  "management",
  "maintenance",
  "landscape",
];

interface JobDetailsSlice {
  jobBuildingName?: string;
  jobState?: string;
  tenderDueDate?: string;
}

const loadJobDetails = (): JobDetailsSlice => {
  try {
    const stored = localStorage.getItem(JOB_DETAILS_KEY);
    if (stored) return JSON.parse(stored);
  } catch {}
  return {};
};

const fmtDate = (iso: string | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
};

const MAX_VISIBLE_SERVICES = 3;

export function GlobalHeader({ isSaving, lastSaved }: { isSaving?: boolean; lastSaved?: Date | null }) {
  const navigate = useNavigate();
  const rosterStore = useRosterStoreOptional();
  const operators = rosterStore?.operators ?? [];
  const { status, isLocked } = useProjectStatus();
  const { user, signOut } = useAuth();
  const { plan, inTrial, trialDaysRemaining, subscription, isPaused, isCanceled, cancelAtPeriodEnd } = usePlan();
  const [jobDetails, setJobDetails] = useState<JobDetailsSlice>(loadJobDetails);
  const [portalLoading, setPortalLoading] = useState(false);

  const openStripePortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("stripe-portal", {
        body: { returnUrl: window.location.origin + "/billing" },
      });
      if (error) throw error;
      const payload = data as { url?: string; error?: string };
      if (payload?.error) throw new Error(payload.error);
      if (payload?.url) {
        window.open(payload.url, "_blank", "noopener,noreferrer");
      }
    } catch (e) {
      const msg = (e as Error).message ?? "Could not open billing portal";
      toast.error(msg);
      if (/no stripe customer/i.test(msg)) navigate("/billing");
    } finally {
      setPortalLoading(false);
    }
  };

  const fmtFullDate = (iso: string | null | undefined) => {
    if (!iso) return "–";
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "–";
    return d.toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" });
  };

  type StatusKind = "trial" | "active" | "cancels" | "paused" | "canceled" | "past_due" | "none";
  const statusKind: StatusKind = inTrial
    ? "trial"
    : cancelAtPeriodEnd
      ? "cancels"
      : isPaused
        ? "paused"
        : isCanceled
          ? "canceled"
          : subscription?.status === "past_due"
            ? "past_due"
            : subscription?.status === "active"
              ? "active"
              : "none";

  const statusLabel: Record<StatusKind, string> = {
    trial:
      trialDaysRemaining === 0
        ? "Trial ends today"
        : `Trial • ${trialDaysRemaining} day${trialDaysRemaining === 1 ? "" : "s"} left`,
    active: "Active",
    cancels: "Cancels soon",
    paused: "Paused",
    canceled: "Cancelled",
    past_due: "Past due",
    none: "No subscription",
  };
  const statusClass: Record<StatusKind, string> = {
    trial: "border-blue-400 text-blue-700 bg-blue-50",
    active: "border-green-500 text-green-700 bg-green-50",
    cancels: "border-amber-500 text-amber-700 bg-amber-50",
    paused: "border-amber-500 text-amber-700 bg-amber-50",
    canceled: "border-muted text-muted-foreground bg-muted/40",
    past_due: "border-destructive text-destructive bg-destructive/10",
    none: "border-muted text-muted-foreground bg-muted/40",
  };

  const showUpgrade = !(plan === "integrated" && (statusKind === "active" || statusKind === "trial"));
  const showPortal = !!subscription?.stripe_customer_id || statusKind !== "none";

  useEffect(() => {
    const handler = () => setJobDetails(loadJobDetails());
    window.addEventListener("storage", handler);
    const interval = setInterval(() => setJobDetails(loadJobDetails()), 500);
    return () => {
      window.removeEventListener("storage", handler);
      clearInterval(interval);
    };
  }, []);

  const activeServices = useMemo<ServiceType[]>(() => {
    const seen = new Set(operators.map((op) => op.service as ServiceType));
    return SERVICE_ORDER.filter((s) => seen.has(s));
  }, [operators]);

  const jobName = jobDetails.jobBuildingName || "—";
  const state = jobDetails.jobState || "—";
  const tenderDate = fmtDate(jobDetails.tenderDueDate) || "—";

  const visibleCodes = activeServices.slice(0, MAX_VISIBLE_SERVICES).map((s) => SERVICE_CODES[s]);
  const overflowCount = activeServices.length - MAX_VISIBLE_SERVICES;
  const servicesLabel =
    activeServices.length === 0
      ? "—"
      : overflowCount > 0
        ? `${visibleCodes.join(", ")} +${overflowCount}`
        : visibleCodes.join(", ");
  const allCodesLabel = activeServices.map((s) => SERVICE_CODES[s]).join(", ");

  return (
    <div className="border-b border-[hsl(120,25%,75%)] bg-[hsl(120,40%,94%)] px-4 py-2 print:py-1.5">
      <div className="container mx-auto flex items-center gap-4">
        {/* LEFT: Logo + Jobs */}
        <div className="flex items-center gap-3 shrink-0">
          <img src={cpqLogo} alt="CPQ Logo" className="h-10 w-auto print:h-8" />
          <Link
            to="/projects"
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-primary text-primary-foreground hover:bg-primary/90 transition-colors shadow-sm"
            title="All Jobs"
          >
            <FolderOpen className="h-4 w-4" />
            Jobs
          </Link>
        </div>

        {/* CENTRE: Job Name */}
        <div className="flex-1 min-w-0 flex justify-center">
          <TooltipProvider delayDuration={300}>
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => navigate("/job-details")}
                  className="max-w-full text-base font-bold print:text-sm leading-tight truncate text-center inline-flex items-center gap-2 hover:text-primary/80 transition-colors cursor-pointer"
                >
                  {isLocked && <Lock className="h-3.5 w-3.5 text-amber-600 shrink-0" />}
                  <span className="truncate">{jobName}</span>
                  {status === "submitted" && (
                    <Badge
                      variant="outline"
                      className="text-[10px] px-1.5 py-0 h-4 border-amber-400 text-amber-700 bg-amber-50 shrink-0"
                    >
                      Submitted
                    </Badge>
                  )}
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="max-w-xs text-sm">
                <p>{jobName}</p>
                <p className="text-muted-foreground text-[10px] mt-0.5">Click to open Job Details</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>

        {/* RIGHT: State + Tender + Services + Saved */}
        <div className="shrink-0 flex items-center gap-3">
          <div className="text-[11px] text-muted-foreground flex items-center gap-3 whitespace-nowrap">
            <span>{state}</span>
            <span className="text-border">|</span>
            {activeServices.length > 0 ? (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <span className="font-medium cursor-default">{servicesLabel}</span>
                  </TooltipTrigger>
                  {overflowCount > 0 && (
                    <TooltipContent side="bottom" className="text-xs">
                      {allCodesLabel}
                    </TooltipContent>
                  )}
                </Tooltip>
              </TooltipProvider>
            ) : (
              <span>—</span>
            )}
            <span className="text-border">|</span>
            <span>Tender: {tenderDate}</span>
          </div>
          {inTrial && trialDaysRemaining !== null && (
            <Link to="/billing">
              <Badge
                variant="outline"
                className="text-[10px] px-1.5 py-0 h-5 border-blue-400 text-blue-700 bg-blue-50 hover:bg-blue-100 whitespace-nowrap"
              >
                {trialDaysRemaining === 0
                  ? "Trial ends today"
                  : `Trial: ${trialDaysRemaining} day${trialDaysRemaining === 1 ? "" : "s"} left`}
              </Badge>
            </Link>
          )}
          <div
            className="flex items-center gap-1 text-[10px] text-muted-foreground whitespace-nowrap"
            title={lastSaved ? `Last saved: ${lastSaved.toLocaleTimeString()}` : "Not saved yet"}
          >
            {isSaving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin" />
                <span>Saving…</span>
              </>
            ) : lastSaved ? (
              <>
                <Cloud className="h-3 w-3 text-green-600" />
                <span>
                  Saved{" "}
                  {lastSaved.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </span>
              </>
            ) : (
              <>
                <CloudOff className="h-3 w-3" />
                <span>Local</span>
              </>
            )}
          </div>
          {user && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7" title={user.email || "Account"}>
                  <UserIcon className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Signed in as
                  <br />
                  <span className="text-foreground font-medium">{user.email}</span>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <div className="px-2 py-1.5 space-y-1.5 text-[11px]">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Plan</span>
                    <span className="text-foreground bg-[#40bd0a] text-white font-semibold font-sans text-xs px-[10px] py-px border-0 rounded-2xl">
                      {PLAN_LABELS[plan]}
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-muted-foreground">Status</span>
                    <Badge
                      variant="outline"
                      className={`text-[10px] px-1.5 py-0 h-5 whitespace-nowrap ${statusClass[statusKind]}`}
                    >
                      {statusLabel[statusKind]}
                    </Badge>
                  </div>
                  {inTrial && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Trial ends</span>
                      <span className="text-foreground">{fmtFullDate(subscription?.trial_end)}</span>
                    </div>
                  )}
                  {!inTrial && !isPaused && !isCanceled && subscription?.current_period_end && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">{cancelAtPeriodEnd ? "Cancels on" : "Next billing"}</span>
                      <span className="text-foreground">{fmtFullDate(subscription.current_period_end)}</span>
                    </div>
                  )}
                  {isPaused && subscription?.pause_ends_at && (
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-muted-foreground">Resumes on</span>
                      <span className="text-foreground">{fmtFullDate(subscription.pause_ends_at)}</span>
                    </div>
                  )}
                </div>
                {/* <DropdownMenuSeparator />
                {showUpgrade && (
                  <DropdownMenuItem onClick={() => navigate('/billing')} className="cursor-pointer">
                    <ArrowUpCircle className="h-4 w-4 mr-2" /> Upgrade Plan
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem
                  onClick={(e) => { e.preventDefault(); if (showPortal) void openStripePortal(); else navigate('/billing'); }}
                  className="cursor-pointer"
                  disabled={portalLoading}
                >
                  {portalLoading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <ExternalLink className="h-4 w-4 mr-2" />
                  )}
                  Manage Subscription
                </DropdownMenuItem> */}
                <DropdownMenuItem onClick={() => navigate("/billing")} className="cursor-pointer">
                  <CreditCard className="h-4 w-4 mr-2" /> Manage Subscription
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={signOut} className="cursor-pointer text-destructive focus:text-destructive">
                  <LogOut className="h-4 w-4 mr-2" /> Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>
    </div>
  );
}
