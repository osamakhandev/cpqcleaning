// Plan change endpoint: upgrade immediately with proration, downgrade scheduled to next renewal.
// Never grants a new trial. Reuses the existing Stripe subscription.
import Stripe from "https://esm.sh/stripe@14.21.0?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

type PlanTier = "basic" | "advanced" | "integrated";
const PLAN_RANK: Record<PlanTier, number> = { basic: 0, advanced: 1, integrated: 2 };
const INTERVAL_RANK: Record<string, number> = { month: 0, year: 1 };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return jsonResponse({ error: "unauthorized" }, 401);

  const supabaseUser = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: userData } = await supabaseUser.auth.getUser();
  const user = userData.user;
  if (!user?.email) return jsonResponse({ error: "unauthorized" }, 401);

  let body: { priceId?: string };
  try { body = await req.json(); } catch { return jsonResponse({ error: "invalid_json" }, 400); }
  const priceId = (body.priceId ?? "").trim();
  if (!priceId) return jsonResponse({ error: "missing_priceId" }, 400);

  const supabaseAdmin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } },
  );

  // Find caller's current non-canceled subscription
  const { data: sub } = await supabaseAdmin
    .from("subscriptions")
    .select("id, stripe_subscription_id, stripe_price_id, stripe_schedule_id, scheduled_price_id, plan, status, trial_end")
    .or(`user_id.eq.${user.id},email.eq.${user.email.toLowerCase()}`)
    .neq("status", "canceled")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub?.stripe_subscription_id) {
    return jsonResponse({ error: "no_active_subscription" }, 400);
  }

  // Resolve target plan/interval
  const { data: targetProduct } = await supabaseAdmin
    .from("stripe_products")
    .select("plan, stripe_price_id, billing_interval")
    .eq("stripe_price_id", priceId)
    .maybeSingle();
  if (!targetProduct) return jsonResponse({ error: "unknown_price" }, 400);

  // Resolve current plan/interval (DB stripe_price_id may lag; trust Stripe)
  const stripeSub = await stripe.subscriptions.retrieve(sub.stripe_subscription_id, {
    expand: ["items.data.price", "latest_invoice.payment_intent"],
  });
  const currentItem = stripeSub.items.data[0];
  const itemId = currentItem?.id;
  const currentPriceId = currentItem?.price?.id ?? sub.stripe_price_id;
  const currentInterval = currentItem?.price?.recurring?.interval ?? "month";

  if (!itemId) return jsonResponse({ error: "subscription_has_no_items" }, 500);

  const { data: currentProduct } = await supabaseAdmin
    .from("stripe_products")
    .select("plan, billing_interval")
    .eq("stripe_price_id", currentPriceId)
    .maybeSingle();

  const currentPlan = (currentProduct?.plan as PlanTier) ?? (sub.plan as PlanTier);
  const targetPlan = targetProduct.plan as PlanTier;
  const newInterval = (targetProduct.billing_interval as string) ?? "month";

  // No-op: same price already active and no scheduled change pending.
  if (currentPriceId === priceId && !sub.stripe_schedule_id) {
    return jsonResponse({ ok: true, unchanged: true });
  }

  // Re-targeting an existing scheduled change to the current price = cancel the schedule.
  if (sub.stripe_schedule_id && currentPriceId === priceId) {
    try {
      await stripe.subscriptionSchedules.release(sub.stripe_schedule_id);
    } catch (e) {
      console.warn("schedule release failed:", (e as Error).message);
    }
    await supabaseAdmin
      .from("subscriptions")
      .update({
        scheduled_plan: null,
        scheduled_price_id: null,
        scheduled_change_at: null,
        stripe_schedule_id: null,
      })
      .eq("id", sub.id);
    return jsonResponse({ ok: true, scheduled_change_canceled: true });
  }

  // Direction
  const planDelta = PLAN_RANK[targetPlan] - PLAN_RANK[currentPlan];
  let direction: "upgrade" | "downgrade";
  if (planDelta > 0) direction = "upgrade";
  else if (planDelta < 0) direction = "downgrade";
  else {
    const intervalDelta = INTERVAL_RANK[newInterval] - INTERVAL_RANK[currentInterval];
    direction = intervalDelta >= 0 ? "upgrade" : "downgrade";
  }

  // If a downgrade schedule exists and user picks a different target, release it first.
  if (sub.stripe_schedule_id) {
    try {
      await stripe.subscriptionSchedules.release(sub.stripe_schedule_id);
    } catch (e) {
      console.warn("schedule release failed:", (e as Error).message);
    }
    await supabaseAdmin
      .from("subscriptions")
      .update({
        scheduled_plan: null,
        scheduled_price_id: null,
        scheduled_change_at: null,
        stripe_schedule_id: null,
      })
      .eq("id", sub.id);
  }

  // Trial handling: never extend or grant. Preserve only if still active.
  const nowSec = Math.floor(Date.now() / 1000);
  const dbTrialEndSec = sub.trial_end
    ? Math.floor(new Date(sub.trial_end as string).getTime() / 1000)
    : null;
  const stripeTrialEnd = stripeSub.trial_end ?? null;
  const existingTrialEnd = dbTrialEndSec ?? stripeTrialEnd;
  const stillTrialing = !!existingTrialEnd && existingTrialEnd > nowSec;

  try {
    if (direction === "upgrade") {
      const intervalChanged = currentInterval !== newInterval;

      const updateParams: Stripe.SubscriptionUpdateParams = {
        items: [{ id: itemId, price: priceId }],
        proration_behavior: stillTrialing ? "none" : "always_invoice",
        cancel_at_period_end: false,
        trial_end: stillTrialing ? (existingTrialEnd as number) : "now",
        // Default payment_behavior: charge immediately against the customer's
        // saved default payment method. Only fall back to client action when
        // Stripe explicitly requires SCA / 3DS.
        payment_behavior: "allow_incomplete",
        expand: ["latest_invoice.payment_intent"],
      };
      if (!intervalChanged && !stillTrialing) {
        updateParams.billing_cycle_anchor = "unchanged";
      }

      const updated = await stripe.subscriptions.update(
        sub.stripe_subscription_id,
        updateParams,
      ) as Stripe.Subscription & {
        latest_invoice?: Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | null };
      };

      let invoice = updated.latest_invoice as
        | (Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | null })
        | null;
      let pi = invoice?.payment_intent ?? null;
      let hostedInvoiceUrl = invoice?.hosted_invoice_url ?? null;

      const needsAction =
        !!pi && pi.status === "requires_action";

      if (needsAction) {
        return jsonResponse({
          success: true,
          requires_action: true,
          client_secret: pi!.client_secret ?? null,
          payment_intent_id: pi!.id,
          hosted_invoice_url: hostedInvoiceUrl,
        });
      }

      // If the invoice is still open / unpaid (no default PM tried, or PI in
      // requires_payment_method), attempt one explicit charge against the
      // customer's default payment method.
      const invoiceUnpaid =
        !!invoice &&
        invoice.status !== "paid" &&
        invoice.status !== "void" &&
        invoice.amount_due > 0;

      if (invoiceUnpaid) {
        try {
          const paid = await stripe.invoices.pay(invoice!.id, {
            expand: ["payment_intent"],
          }) as Stripe.Invoice & { payment_intent?: Stripe.PaymentIntent | null };
          invoice = paid;
          pi = paid.payment_intent ?? null;
          hostedInvoiceUrl = paid.hosted_invoice_url ?? hostedInvoiceUrl;

          if (pi && pi.status === "requires_action") {
            return jsonResponse({
              success: true,
              requires_action: true,
              client_secret: pi.client_secret ?? null,
              payment_intent_id: pi.id,
              hosted_invoice_url: hostedInvoiceUrl,
            });
          }
        } catch (payErr) {
          console.error("invoice.pay failed:", (payErr as Error).message);
          return jsonResponse({
            success: false,
            payment_failed: true,
            hosted_invoice_url: hostedInvoiceUrl,
            message: (payErr as Error).message,
          }, 402);
        }
      }

      // Re-fetch the subscription so the status reflects the just-paid invoice.
      const refreshed = await stripe.subscriptions.retrieve(sub.stripe_subscription_id);
      const finalStatus = refreshed.status;


      // Optimistic DB update; webhook reconciles authoritatively.
      await supabaseAdmin
        .from("subscriptions")
        .update({
          stripe_price_id: priceId,
          plan: targetPlan,
          status: finalStatus,
          current_period_end: refreshed.current_period_end
            ? new Date(refreshed.current_period_end * 1000).toISOString()
            : null,
          trial_end: refreshed.trial_end
            ? new Date(refreshed.trial_end * 1000).toISOString()
            : null,

          scheduled_plan: null,
          scheduled_price_id: null,
          scheduled_change_at: null,
          stripe_schedule_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sub.id);

      // Sync profiles.plan_type. Prefer the subscription's user_id; fall back to
      // the caller's user.id, then to an email lookup.
      let profileUserId: string | null = (sub as { user_id?: string | null }).user_id ?? user.id ?? null;
      if (!profileUserId && user.email) {
        try {
          const { data: list } = await supabaseAdmin.auth.admin.listUsers();
          profileUserId =
            list?.users.find((u) => (u.email ?? "").toLowerCase() === user.email!.toLowerCase())?.id ?? null;
        } catch (e) {
          console.warn("listUsers fallback failed:", (e as Error).message);
        }
      }

      if (profileUserId) {
        const { error: profileErr } = await supabaseAdmin
          .from("profiles")
          .update({ plan_type: targetPlan })
          .eq("id", profileUserId);
        if (profileErr) {
          console.error("profiles plan_type sync failed:", profileErr.message);
        }
      } else {
        console.error("profiles plan_type sync skipped: no user id resolved");
      }

      return jsonResponse({
        success: true,
        requires_action: false,
        status: finalStatus,
      });
    }

    // ===== Downgrade: schedule swap at next renewal =====
    const periodEnd = stripeSub.current_period_end;

    const schedule = await stripe.subscriptionSchedules.create({
      from_subscription: sub.stripe_subscription_id,
    });

    // The schedule starts with one phase mirroring the current sub; replace with two phases.
    const startDate = schedule.phases[0]?.start_date;

    await stripe.subscriptionSchedules.update(schedule.id, {
      end_behavior: "release",
      phases: [
        {
          items: [{ price: currentPriceId!, quantity: 1 }],
          start_date: startDate,
          end_date: periodEnd,
          proration_behavior: "none",
        },
        {
          items: [{ price: priceId, quantity: 1 }],
          iterations: 1,
          proration_behavior: "none",
        },
      ],
    });

    await supabaseAdmin
      .from("subscriptions")
      .update({
        scheduled_plan: targetPlan,
        scheduled_price_id: priceId,
        scheduled_change_at: new Date(periodEnd * 1000).toISOString(),
        stripe_schedule_id: schedule.id,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);

    return jsonResponse({
      success: true,
      requires_action: false,
      scheduled: true,
      effective_at: new Date(periodEnd * 1000).toISOString(),
      plan: targetPlan,
    });
  } catch (err) {
    console.error("plan change failed:", (err as Error).message);
    return jsonResponse({ error: "stripe_error", message: (err as Error).message }, 500);
  }
});
