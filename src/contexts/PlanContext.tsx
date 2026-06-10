import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { hasAccess, type FeatureKey, type PlanType } from "@/lib/featureAccess";

export type SubscriptionStatus = "trialing" | "active" | "past_due" | "canceled" | "incomplete" | "paused";

export interface SubscriptionInfo {
  plan: PlanType;
  status: SubscriptionStatus;
  trial_end: string | null;
  current_period_end: string | null;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  stripe_price_id: string | null;
  paused_at: string | null;
  pause_ends_at: string | null;
  pause_days_used: number | null;
  cancel_at_period_end: boolean;
  scheduled_plan: PlanType | null;
  scheduled_price_id: string | null;
  scheduled_change_at: string | null;
  stripe_schedule_id: string | null;
  pause_count_in_window: number | null;
  pause_window_start: string | null;
}

export const MAX_PAUSE_DAYS = 30;
export const PAUSE_QUOTA_PER_YEAR = 2;
export const PAUSE_WINDOW_DAYS = 365;

export interface PauseQuota {
  used: number;
  max: number;
  windowResetsAt: string | null;
  canPause: boolean;
}

interface PlanContextValue {
  plan: PlanType;
  loading: boolean;
  subscription: SubscriptionInfo | null;
  inTrial: boolean;
  trialDaysRemaining: number | null;
  isPaused: boolean;
  pauseScheduled: boolean;
  isCanceled: boolean;
  cancelAtPeriodEnd: boolean;
  accessBlocked: boolean;
  pauseDaysRemaining: number;
  pauseQuota: PauseQuota;
  hasAccess: (feature: FeatureKey | string) => boolean;
  setPlan: (next: PlanType) => Promise<void>;
  refresh: () => Promise<void>;
  refreshUntil: (
    predicate: (p: PlanType, sub: SubscriptionInfo | null) => boolean,
    opts?: { attempts?: number; intervalMs?: number },
  ) => Promise<boolean>;
}

const PlanContext = createContext<PlanContextValue | undefined>(undefined);

export function PlanProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [plan, setPlanState] = useState<PlanType>("basic");
  const [subscription, setSubscription] = useState<SubscriptionInfo | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async (): Promise<{ plan: PlanType; sub: SubscriptionInfo | null }> => {
    if (!user) {
      setPlanState("basic");
      setSubscription(null);
      setLoading(false);
      return { plan: "basic", sub: null };
    }
    const [profileRes, subRes] = await Promise.all([
      supabase.from("profiles").select("plan_type").eq("id", user.id).maybeSingle(),
      supabase
        .from("subscriptions")
        .select(
          "plan, status, trial_end, current_period_end, stripe_subscription_id, stripe_customer_id, stripe_price_id, paused_at, pause_ends_at, pause_days_used, cancel_at_period_end, scheduled_plan, scheduled_price_id, scheduled_change_at, stripe_schedule_id, pause_count_in_window, pause_window_start",
        )
        .or(`user_id.eq.${user.id},email.eq.${(user.email ?? "").toLowerCase()}`)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const nextPlan = (profileRes.data?.plan_type as PlanType | undefined) ?? "basic";
    const nextSub = (subRes.data as SubscriptionInfo | null) ?? null;
    setPlanState(nextPlan);
    setSubscription(nextSub);
    setLoading(false);
    return { plan: nextPlan, sub: nextSub };
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  // Listen for realtime changes on profiles & subscriptions for this user
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`plan-sync-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles", filter: `id=eq.${user.id}` }, () => {
        void load();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "subscriptions", filter: `user_id=eq.${user.id}` },
        () => {
          void load();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [user, load]);

  const setPlan = useCallback(
    async (next: PlanType) => {
      if (!user) return;
      // Plan changes are server-managed (via Stripe webhooks). Update local state only;
      // the database value is the source of truth and will not accept client writes.
      setPlanState(next);
    },
    [user],
  );

  const refreshUntil = useCallback(
    async (
      predicate: (p: PlanType, sub: SubscriptionInfo | null) => boolean,
      opts?: { attempts?: number; intervalMs?: number },
    ): Promise<boolean> => {
      const attempts = opts?.attempts ?? 10;
      const intervalMs = opts?.intervalMs ?? 1500;
      for (let i = 0; i < attempts; i++) {
        const { plan: p, sub } = await load();
        if (predicate(p, sub)) return true;
        await new Promise((r) => setTimeout(r, intervalMs));
      }
      return false;
    },
    [load],
  );

  const inTrial = useMemo(() => {
    if (!subscription || subscription.status !== "trialing" || !subscription.trial_end) return false;
    return new Date(subscription.trial_end).getTime() > Date.now();
  }, [subscription]);

  const trialDaysRemaining = useMemo(() => {
    if (!inTrial || !subscription?.trial_end) return null;
    const ms = new Date(subscription.trial_end).getTime() - Date.now();
    return Math.max(0, Math.ceil(ms / 86400000));
  }, [inTrial, subscription]);

  const isPaused = subscription?.status === "paused";
  const isCanceled = subscription?.status === "canceled";
  const isPastDue = subscription?.status === "past_due";
  const cancelAtPeriodEnd = !!subscription?.cancel_at_period_end && !isCanceled;
  // A pause is "scheduled" when we've set pause_ends_at but the user is still in
  // their paid period (status not yet flipped to paused by the webhook).
  const pauseScheduled =
    !!subscription?.pause_ends_at && !isPaused && !isCanceled;
  const accessBlocked = !inTrial && (isPaused || isCanceled || isPastDue);
  const pauseDaysRemaining = MAX_PAUSE_DAYS;

  const pauseQuota = useMemo<PauseQuota>(() => {
    const rawCount = subscription?.pause_count_in_window ?? 0;
    const windowStart = subscription?.pause_window_start
      ? new Date(subscription.pause_window_start).getTime()
      : null;
    const windowExpired =
      windowStart !== null && Date.now() - windowStart > PAUSE_WINDOW_DAYS * 86400000;
    const used = windowExpired ? 0 : rawCount;
    const windowResetsAt =
      windowStart && !windowExpired
        ? new Date(windowStart + PAUSE_WINDOW_DAYS * 86400000).toISOString()
        : null;
    return {
      used,
      max: PAUSE_QUOTA_PER_YEAR,
      windowResetsAt,
      canPause: used < PAUSE_QUOTA_PER_YEAR,
    };
  }, [subscription]);

  const value = useMemo<PlanContextValue>(
    () => ({
      plan,
      loading,
      subscription,
      inTrial,
      trialDaysRemaining,
      isPaused,
      pauseScheduled,
      isCanceled,
      cancelAtPeriodEnd,
      accessBlocked,
      pauseDaysRemaining,
      pauseQuota,
      // Trial = full access; paused/canceled = no access; otherwise plan-based
      hasAccess: (feature) => (inTrial ? true : accessBlocked ? false : hasAccess(plan, feature)),
      setPlan,
      refresh: async () => {
        await load();
      },
      refreshUntil,
    }),
    [
      plan,
      loading,
      subscription,
      inTrial,
      trialDaysRemaining,
      isPaused,
      pauseScheduled,
      isCanceled,
      cancelAtPeriodEnd,
      accessBlocked,
      pauseDaysRemaining,
      pauseQuota,
      setPlan,
      load,
      refreshUntil,
    ],
  );

  return <PlanContext.Provider value={value}>{children}</PlanContext.Provider>;
}

export function usePlan() {
  const ctx = useContext(PlanContext);
  if (!ctx) throw new Error("usePlan must be used within PlanProvider");
  return ctx;
}
