import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { usePlan, MAX_PAUSE_DAYS, PAUSE_QUOTA_PER_YEAR } from '@/contexts/PlanContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, PauseCircle, PlayCircle, XCircle, RotateCcw, ExternalLink } from 'lucide-react';

import { toast } from 'sonner';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { PLAN_LABELS, PLAN_TAGLINES, type PlanType } from '@/lib/featureAccess';

interface StripeProduct {
  plan: PlanType;
  stripe_price_id: string;
  billing_interval: 'month' | 'year';
  unit_amount: number | null;
  currency: string | null;
  payment_link_url: string | null;
}

const formatPrice = (amount: number | null, currency: string | null) => {
  if (amount == null) return null;
  try {
    return new Intl.NumberFormat('en-AU', {
      style: 'currency',
      currency: (currency ?? 'aud').toUpperCase(),
      minimumFractionDigits: 2,
    }).format(amount / 100);
  } catch {
    return `$${(amount / 100).toFixed(2)}`;
  }
};

const PLAN_ORDER: PlanType[] = ['basic', 'advanced', 'integrated'];

export default function Billing() {
  const { plan, subscription, inTrial, trialDaysRemaining, isPaused, pauseScheduled, isCanceled, cancelAtPeriodEnd, pauseQuota, loading, refresh, refreshUntil } = usePlan();
  const [products, setProducts] = useState<StripeProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [subActionLoading, setSubActionLoading] = useState<'pause' | 'resume' | 'cancel' | 'reactivate' | null>(null);
  const [portalLoading, setPortalLoading] = useState(false);

  const openCustomerPortal = async () => {
    setPortalLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-portal', {
        body: { returnUrl: window.location.href },
      });
      if (error) {
        console.error('stripe-portal failed', error, data);
        const ctxBody = (error as { context?: { body?: unknown } }).context?.body;
        let detail: string | undefined;
        if (typeof ctxBody === 'string') {
          try { detail = (JSON.parse(ctxBody) as { error?: string }).error; } catch { detail = ctxBody; }
        } else if (ctxBody && typeof ctxBody === 'object') {
          detail = (ctxBody as { error?: string }).error;
        }
        throw new Error(detail || error.message || 'Failed to open billing portal');
      }
      const url = (data as { url?: string })?.url;
      if (!url) throw new Error('No portal URL returned');
      window.location.assign(url);
    } catch (e) {
      console.error('Customer Portal error', e);
      toast.error((e as Error).message || 'Failed to open billing portal');
    } finally {
      setPortalLoading(false);
    }
  };





  const periodEndLabel = subscription?.current_period_end
    ? new Date(subscription.current_period_end).toLocaleDateString('en-AU')
    : null;

  const currentInterval = products.find((p) => p.stripe_price_id === subscription?.stripe_price_id)?.billing_interval;
  const isMonthly = currentInterval === 'month';

  const manageSubscription = async (action: 'pause' | 'resume' | 'cancel' | 'reactivate') => {
    setSubActionLoading(action);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-manage-subscription', {
        body: { action },
      });
      if (error) throw error;
      if ((data as { error?: string })?.error) throw new Error((data as { error: string }).error);
      await refreshUntil(
        (_p, sub) => {
          if (action === 'pause') return !!sub?.pause_ends_at;
          if (action === 'resume') return !sub?.pause_ends_at && (sub?.status === 'active' || sub?.status === 'trialing');
          if (action === 'cancel') return !!sub?.cancel_at_period_end;
          if (action === 'reactivate') return !sub?.cancel_at_period_end;
          return false;
        },
        { attempts: 10, intervalMs: 1200 },
      );
      await refresh();
      toast.success(
        action === 'pause' ? `Pause scheduled — starts ${periodEndLabel ?? 'at the end of your billing period'}`
          : action === 'resume' ? (isPaused ? 'Subscription resumed' : 'Scheduled pause cancelled')
          : action === 'reactivate' ? 'Cancellation reverted — subscription will continue'
          : `Subscription will end on ${periodEndLabel ?? 'the period end'}`,
      );
    } catch (e) {
      toast.error((e as Error).message ?? `Could not ${action} subscription`);
    } finally {
      setSubActionLoading(null);
    }
  };

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from('stripe_products')
        .select('plan, stripe_price_id, billing_interval, unit_amount, currency, payment_link_url');
      setProducts((data as StripeProduct[] | null) ?? []);
      setProductsLoading(false);
    })();
  }, []);

  const hasStripeSub = !!subscription?.stripe_subscription_id;
  const currentPriceId = (subscription as unknown as { stripe_price_id?: string } | null)?.stripe_price_id ?? null;

  const changePlan = async (priceId: string) => {
    setActionLoading(priceId);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-update-subscription', {
        body: { priceId },
      });
      if (error) throw error;
      const payload = data as {
        ok?: boolean;
        unchanged?: boolean;
        scheduled_change_canceled?: boolean;
        success?: boolean;
        requires_action?: boolean;
        client_secret?: string | null;
        hosted_invoice_url?: string | null;
        scheduled?: boolean;
        effective_at?: string;
        plan?: string;
        error?: string;
      };
      if (payload?.error) throw new Error(payload.error);

      if (payload?.unchanged) {
        toast.info('Already on this plan');
        return;
      }
      if (payload?.scheduled_change_canceled) {
        toast.success('Scheduled plan change cancelled');
        await refresh();
        return;
      }
      if (payload?.requires_action) {
        // 3DS / SCA — send the user to Stripe's hosted invoice page to confirm.
        if (payload.hosted_invoice_url) {
          toast.info('Confirming payment with your bank…');
          window.location.href = payload.hosted_invoice_url;
          return;
        }
        throw new Error('Payment requires authentication but no confirmation URL was returned.');
      }
      if (payload?.scheduled) {
        const when = payload.effective_at ? new Date(payload.effective_at).toLocaleDateString('en-AU') : 'next renewal';
        toast.success(`Downgrade scheduled — takes effect on ${when}`);
        await refresh();
        return;
      }
      // Upgrade succeeded
      await refreshUntil(
        (_p, sub) => sub?.stripe_price_id === priceId && sub?.status !== 'canceled' && sub?.status !== 'paused',
        { attempts: 12, intervalMs: 1500 },
      );
      await refresh();
      toast.success('Plan upgraded successfully');
    } catch (e) {
      toast.error((e as Error).message ?? 'Could not change plan');
    } finally {
      setActionLoading(null);
    }
  };

  const resubscribe = async (priceId: string) => {
    setActionLoading(priceId);
    try {
      const { data, error } = await supabase.functions.invoke('stripe-resubscribe', {
        body: { priceId },
      });
      if (error) throw error;
      const payload = data as { ok?: boolean; url?: string; requiresCheckout?: boolean; error?: string };
      if (payload?.error) throw new Error(payload.error);

      // No saved card — fall back to Stripe Checkout
      if (payload?.requiresCheckout && payload.url) {
        window.location.href = payload.url;
        return;
      }

      // Instant API resubscribe — poll until DB reflects it
      await refreshUntil(
        (_p, sub) => sub?.stripe_price_id === priceId && sub?.status !== 'canceled' && sub?.status !== 'paused',
        { attempts: 12, intervalMs: 1500 },
      );
      await refresh();
      toast.success('Subscription restored');
    } catch (e) {
      toast.error((e as Error).message ?? 'Could not resubscribe');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container max-w-5xl mx-auto py-8 space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Billing & Plan</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Manage your subscription and unlock additional features.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 flex-wrap">
            Current plan: {PLAN_LABELS[plan]}
            {inTrial && (
              <Badge variant="secondary">
                Trial — {trialDaysRemaining} day{trialDaysRemaining === 1 ? '' : 's'} left
              </Badge>
            )}
            {subscription?.status === 'active' && <Badge>Active</Badge>}
            {subscription?.status === 'past_due' && (
              <Badge variant="destructive">Past due</Badge>
            )}
            {subscription?.status === 'paused' && (
              <Badge variant="outline" className="border-amber-500 text-amber-700">Paused</Badge>
            )}
            {subscription?.status === 'canceled' && (
              <Badge variant="outline">Cancelled</Badge>
            )}
            {cancelAtPeriodEnd && (
              <Badge variant="outline" className="border-amber-500 text-amber-700">
                Cancels on {periodEndLabel}
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="mt-1">{PLAN_TAGLINES[plan]}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {subscription?.current_period_end && !isPaused && subscription.status !== 'canceled' && !cancelAtPeriodEnd && (
            <div className="text-xs text-muted-foreground">
              Renews on {periodEndLabel}
            </div>
          )}
          {cancelAtPeriodEnd && (
            <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-900 dark:text-amber-200">
              Your subscription is scheduled to cancel on <strong>{periodEndLabel}</strong>.
              You'll keep full access until then. Change your mind? Reactivate any time before that date.
            </div>
          )}
          {subscription?.scheduled_plan && subscription.scheduled_price_id && currentPriceId && (
            <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3 flex-wrap">
              <span>
                Scheduled to switch to <strong>{PLAN_LABELS[subscription.scheduled_plan as PlanType]}</strong>{' '}
                on <strong>{subscription.scheduled_change_at ? new Date(subscription.scheduled_change_at).toLocaleDateString('en-AU') : 'next renewal'}</strong>.
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={!!actionLoading}
                onClick={() => changePlan(currentPriceId)}
              >
                Cancel scheduled change
              </Button>
            </div>
          )}
          {pauseScheduled && (
            <div className="rounded-md border border-amber-500/40 bg-amber-50 dark:bg-amber-950/20 p-3 text-sm text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3 flex-wrap">
              <span>
                Pause scheduled — billing pauses on <strong>{periodEndLabel}</strong>{subscription?.pause_ends_at ? <> and auto-resumes on <strong>{new Date(subscription.pause_ends_at).toLocaleDateString('en-AU')}</strong></> : null}. You keep full access until then.
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={!!subActionLoading}
                onClick={() => manageSubscription('resume')}
              >
                {subActionLoading === 'resume' ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : null}
                Cancel scheduled pause
              </Button>
            </div>
          )}
          {isPaused && (
            <div className="text-xs text-muted-foreground">
              Paused{subscription?.pause_ends_at ? ` — auto-resumes ${new Date(subscription.pause_ends_at).toLocaleDateString('en-AU')}` : ''}.
            </div>
          )}

          {subscription && subscription.status !== 'canceled' && (
            <div className="flex flex-wrap gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                disabled={portalLoading}
                onClick={openCustomerPortal}
              >
                {portalLoading ? (
                  <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                ) : (
                  <ExternalLink className="h-4 w-4 mr-1.5" />
                )}
                Customer Portal

              </Button>

              {!isPaused && !pauseScheduled && !cancelAtPeriodEnd && isMonthly && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={!!subActionLoading || !pauseQuota.canPause}
                      title={
                        !pauseQuota.canPause && pauseQuota.windowResetsAt
                          ? `Pause limit reached. Next pause available after ${new Date(pauseQuota.windowResetsAt).toLocaleDateString('en-AU')}.`
                          : undefined
                      }
                    >
                      <PauseCircle className="h-4 w-4 mr-1.5" />
                      {periodEndLabel ? `Pause from ${periodEndLabel}` : 'Pause subscription'}
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Pause your subscription?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Your subscription stays active until <strong>{periodEndLabel ?? 'the end of your billing period'}</strong>.
                        After that, it pauses for <strong>{MAX_PAUSE_DAYS} days</strong> with no charge, then auto-resumes.
                        You can pause up to <strong>{PAUSE_QUOTA_PER_YEAR} times per year</strong>
                        {pauseQuota.used > 0 ? ` (${pauseQuota.used} of ${PAUSE_QUOTA_PER_YEAR} used)` : ''}.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep active</AlertDialogCancel>
                      <AlertDialogAction onClick={() => manageSubscription('pause')}>
                        Schedule {MAX_PAUSE_DAYS}-day pause
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {!isPaused && !pauseScheduled && !cancelAtPeriodEnd && isMonthly && !pauseQuota.canPause && pauseQuota.windowResetsAt && (
                <span className="text-xs text-muted-foreground self-center">
                  Pause limit reached — next pause available after {new Date(pauseQuota.windowResetsAt).toLocaleDateString('en-AU')}.
                </span>
              )}
              {isPaused && (
                <Button
                  size="sm"
                  disabled={!!subActionLoading}
                  onClick={() => manageSubscription('resume')}
                >
                  {subActionLoading === 'resume' ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <PlayCircle className="h-4 w-4 mr-1.5" />
                  )}
                  Resume subscription
                </Button>
              )}


              {cancelAtPeriodEnd ? (
                <Button
                  size="sm"
                  disabled={!!subActionLoading}
                  onClick={() => manageSubscription('reactivate')}
                >
                  {subActionLoading === 'reactivate' ? (
                    <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4 mr-1.5" />
                  )}
                  Reactivate subscription
                </Button>
              ) : (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="outline" size="sm" disabled={!!subActionLoading}>
                      <XCircle className="h-4 w-4 mr-1.5" />
                      Cancel subscription
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Cancel your subscription?</AlertDialogTitle>
                      <AlertDialogDescription>
                        Your subscription will remain active until <strong>{periodEndLabel ?? 'the end of the current period'}</strong>.
                        After that, access ends and you'll need to resubscribe. You can reactivate any time before then.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Keep subscription</AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => manageSubscription('cancel')}
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      >
                        Cancel at period end
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {subActionLoading && (
                <div className="flex items-center text-xs text-muted-foreground">
                  <Loader2 className="h-3 w-3 mr-1.5 animate-spin" />
                  Updating…
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <div>
        <h2 className="text-lg font-semibold mb-3">
          {isCanceled || !hasStripeSub ? 'Resubscribe' : 'Available plans'}
        </h2>
        {isCanceled && (
          <p className="text-sm text-muted-foreground mb-3">
            Your subscription has been cancelled. Pick a plan below to resubscribe and restore access — your data is preserved.
          </p>
        )}
        {!hasStripeSub && !isCanceled && (
          <p className="text-xs text-muted-foreground mb-3">
            No active subscription on file. Choose a plan below to subscribe.
          </p>
        )}
        {productsLoading ? (
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        ) : products.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-sm text-muted-foreground">
              No plans configured yet.
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-3">
            {PLAN_ORDER.map((p) => {
              const planProducts = products.filter((x) => x.plan === p);
              const needsResubscribe = isCanceled || !hasStripeSub;
              const isCurrentPlan = !needsResubscribe && p === plan;
              return (
                <Card key={p} className={isCurrentPlan ? 'border-primary' : ''}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      {PLAN_LABELS[p]}
                      {isCurrentPlan && <Badge variant="secondary">Current</Badge>}
                    </CardTitle>
                    <CardDescription>{PLAN_TAGLINES[p]}</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-2">
                    {planProducts.length === 0 ? (
                      <p className="text-xs text-muted-foreground">Not yet available.</p>
                    ) : (
                      planProducts.map((prod) => {
                        const priceLabel = formatPrice(prod.unit_amount, prod.currency);
                        const intervalLabel = prod.billing_interval === 'year' ? 'year' : 'month';
                        const isLoading = actionLoading === prod.stripe_price_id;
                        const isCurrentPrice = !needsResubscribe && currentPriceId === prod.stripe_price_id;

                        if (needsResubscribe) {
                          return (
                            <div key={prod.stripe_price_id} className="space-y-1">
                              {priceLabel && (
                                <div className="text-sm font-medium">
                                  {priceLabel}
                                  <span className="text-muted-foreground font-normal"> / {intervalLabel}</span>
                                </div>
                              )}
                              <Button
                                className="w-full"
                                disabled={isLoading || !!actionLoading}
                                onClick={() => resubscribe(prod.stripe_price_id)}
                              >
                                {isLoading ? (
                                  <Loader2 className="h-4 w-4 animate-spin" />
                                ) : (
                                  <>Subscribe {prod.billing_interval === 'year' ? 'yearly' : 'monthly'}</>
                                )}
                              </Button>
                            </div>
                          );
                        }

                        const disabled = isLoading || !!actionLoading || isCurrentPrice;
                        return (
                          <div key={prod.stripe_price_id} className="space-y-1">
                            {priceLabel && (
                              <div className="text-sm font-medium">
                                {priceLabel}
                                <span className="text-muted-foreground font-normal"> / {intervalLabel}</span>
                              </div>
                            )}
                            <Button
                              variant={isCurrentPrice ? 'outline' : 'default'}
                              className="w-full"
                              disabled={disabled}
                              onClick={() => changePlan(prod.stripe_price_id)}
                            >
                              {isLoading ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : isCurrentPrice ? (
                                'Current plan'
                              ) : (
                                <>Switch to {prod.billing_interval === 'year' ? 'yearly' : 'monthly'}</>
                              )}
                            </Button>
                          </div>
                        );
                      })
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
