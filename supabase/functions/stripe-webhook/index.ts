// Stripe webhook: provisions approved_users + subscriptions on Stripe events.
// Idempotent via stripe_webhook_events table.
import Stripe from "https://esm.sh/stripe@14.21.0?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});
const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

type PlanTier = "basic" | "advanced" | "integrated";

async function resolvePlanFromPriceId(priceId: string): Promise<PlanTier | null> {
  const { data } = await supabase
    .from("stripe_products")
    .select("plan")
    .eq("stripe_price_id", priceId)
    .maybeSingle();
  return (data?.plan as PlanTier) ?? null;
}

async function upsertApprovedUser(email: string, fullName: string | null) {
  // Insert if missing; reactivate if exists.
  const { data: existing } = await supabase
    .from("approved_users")
    .select("email")
    .ilike("email", email)
    .maybeSingle();
  if (existing) {
    await supabase
      .from("approved_users")
      .update({ is_active: true, full_name: fullName ?? undefined })
      .ilike("email", email);
  } else {
    await supabase.from("approved_users").insert({
      email: email.toLowerCase(),
      full_name: fullName,
      is_active: true,
      invited_by: "stripe",
    });
  }
}

async function mirrorPlanToProfile(userId: string, email: string, plan: PlanTier) {
  const { error } = await supabase
    .from("profiles")
    .upsert({ id: userId, email, plan_type: plan }, { onConflict: "id" });
  if (error) console.error("mirrorPlanToProfile failed:", error.message);
}

async function findAuthUserByEmail(email: string): Promise<{ id: string; email?: string | null } | null> {
  try {
    const { data: list } = await supabase.auth.admin.listUsers();
    return list?.users.find((u) => (u.email ?? "").toLowerCase() === email.toLowerCase()) ?? null;
  } catch (e) {
    console.warn("listUsers failed:", (e as Error).message);
    return null;
  }
}

// Ensures an auth.users row exists for `email`. Creates one immediately on first checkout
// (so a profile row can be inserted right away) and sends a recovery/invite link so the
// customer can set a password. Returns the auth user id.
async function sendPasswordResetEmail(email: string, redirectTo: string) {
  // resetPasswordForEmail (on anon client) actually delivers the email,
  // unlike admin.generateLink which only returns the link.
  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { auth: { persistSession: false } },
  );
  const { error } = await anon.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) console.error("resetPasswordForEmail failed:", error.message);
}

async function ensureAuthUser(email: string): Promise<string | null> {
  const siteUrl = Deno.env.get("SITE_URL") ?? "https://cpq-web-master-v1-1.lovable.app";
  const redirectTo = `${siteUrl}/reset-password?invite=1`;

  let existing = await findAuthUserByEmail(email);
  let isNewUser = false;

  if (!existing) {
    // Invite the new user — this CREATES the auth user AND sends the invite email.
    try {
      const { data: invited, error: inviteErr } = await supabase.auth.admin.inviteUserByEmail(
        email,
        { redirectTo },
      );
      if (inviteErr) {
        console.error("inviteUserByEmail failed:", inviteErr.message);
        // Fallback: create the user directly and send a reset email.
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
        });
        if (createErr) {
          console.error("admin.createUser fallback failed:", createErr.message);
          existing = await findAuthUserByEmail(email);
        } else if (created?.user) {
          existing = { id: created.user.id, email: created.user.email };
          isNewUser = true;
        }
        await sendPasswordResetEmail(email, redirectTo);
      } else if (invited?.user) {
        existing = { id: invited.user.id, email: invited.user.email };
        isNewUser = true;
      }
    } catch (e) {
      console.warn("invite threw:", (e as Error).message);
      existing = await findAuthUserByEmail(email);
    }
  }

  // Existing users get NO email here — they already have credentials, or can use
  // the "Forgot password" flow on the login page.
  return existing?.id ?? null;
}

// Silent variant for subscription updates (upgrade/downgrade/renewal).
// Never sends invite or password-reset emails.
async function getOrCreateAuthUserSilent(email: string): Promise<string | null> {
  let existing = await findAuthUserByEmail(email);
  if (existing) return existing.id;
  try {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email,
      email_confirm: true,
    });
    if (error) {
      console.error("silent createUser failed:", error.message);
      return null;
    }
    return created?.user?.id ?? null;
  } catch (e) {
    console.warn("silent createUser threw:", (e as Error).message);
    return null;
  }
}

async function provisionForSubscription(
  email: string,
  fullName: string | null,
  subscription: Stripe.Subscription,
  plan: PlanTier,
) {
  await upsertApprovedUser(email, fullName);

  // Create the auth user immediately so a profile row is guaranteed.
  // ensureAuthUser also sends the recovery/invite email link.
  const userId = await ensureAuthUser(email);

  if (userId) {
    await mirrorPlanToProfile(userId, email, plan);
  } else {
    console.error("ensureAuthUser returned null for", email);
  }

  const priceId = subscription.items.data[0]?.price.id;
  const trialStart = subscription.trial_start
    ? new Date(subscription.trial_start * 1000).toISOString()
    : null;
  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null;

  await supabase.from("subscriptions").upsert(
    {
      user_id: userId,
      email,
      plan,
      status: subscription.status as
        | "trialing"
        | "active"
        | "past_due"
        | "canceled"
        | "incomplete",
      trial_start: trialStart,
      trial_end: trialEnd,
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      stripe_customer_id: subscription.customer as string,
      stripe_subscription_id: subscription.id,
      stripe_price_id: priceId,
    },
    { onConflict: "stripe_subscription_id" },
  );
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const email = (session.customer_email ?? session.customer_details?.email ?? "").toLowerCase();
  if (!email) return;
  const fullName =
    (session.metadata?.full_name as string | undefined) ??
    session.customer_details?.name ??
    null;
  const subscriptionId = session.subscription as string | null;
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  const priceId = subscription.items.data[0]?.price.id;
  const plan = priceId ? await resolvePlanFromPriceId(priceId) : null;
  if (!plan) {
    console.error("No plan mapping for price", priceId);
    return;
  }

  await provisionForSubscription(email, fullName, subscription, plan);
}

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price.id;
  const plan = priceId ? await resolvePlanFromPriceId(priceId) : null;
  if (!plan) {
    console.error("No plan mapping for price", priceId);
    return;
  }

  // Ensure a 7-day trial on any newly-created subscription that doesn't already have one.
  if (!subscription.trial_end && subscription.status !== "canceled") {
    try {
      const trialEndTs = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60;
      subscription = await stripe.subscriptions.update(subscription.id, {
        trial_end: trialEndTs,
        proration_behavior: "none",
      });
    } catch (e) {
      console.warn("Failed to apply 7-day trial:", (e as Error).message);
    }
  }

  const customer = await stripe.customers.retrieve(subscription.customer as string);
  if ((customer as Stripe.DeletedCustomer).deleted) {
    console.error("Customer deleted, cannot provision:", subscription.customer);
    return;
  }
  const cust = customer as Stripe.Customer;
  const email = cust.email?.toLowerCase();
  if (!email) {
    console.error("No email on customer", cust.id);
    return;
  }
  const fullName =
    (subscription.metadata?.full_name as string | undefined) ??
    (cust.metadata?.full_name as string | undefined) ??
    cust.name ??
    null;

  await provisionForSubscription(email, fullName, subscription, plan);
}

async function handleSubscriptionChange(subscription: Stripe.Subscription) {
  const priceId = subscription.items.data[0]?.price.id;
  const plan = priceId ? await resolvePlanFromPriceId(priceId) : null;
  if (!plan) {
    console.error("No plan mapping for price", priceId);
    return;
  }
  const customer = await stripe.customers.retrieve(subscription.customer as string);
  const email = (customer as Stripe.Customer).email?.toLowerCase();
  if (!email) return;

  const userId = await getOrCreateAuthUserSilent(email);
  if (userId) {
    await mirrorPlanToProfile(userId, email, plan);
  }

  // Look up scheduled change to know whether to clear it.
  const { data: existingRow } = await supabase
    .from("subscriptions")
    .select("scheduled_price_id, stripe_schedule_id, paused_at")
    .eq("stripe_subscription_id", subscription.id)
    .maybeSingle();

  // If the active price now equals the scheduled target, the schedule has advanced — clear it.
  const scheduledMatched =
    !!existingRow?.scheduled_price_id && existingRow.scheduled_price_id === priceId;

  // Pause handling:
  // - Stripe sets pause_collection as soon as we call it, but the user keeps access
  //   until the current paid period ends. We therefore only flip status='paused' once
  //   the scheduled pause start (paused_at) has actually been reached.
  const hasPauseCollection = !!subscription.pause_collection;
  const pausedAtMs = existingRow?.paused_at ? new Date(existingRow.paused_at).getTime() : 0;
  const pauseActive = hasPauseCollection && (!pausedAtMs || pausedAtMs <= Date.now());
  const status = pauseActive ? "paused" : (subscription.status as string);

  await supabase
    .from("subscriptions")
    .update({
      plan,
      status,
      stripe_price_id: priceId,
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: !!subscription.cancel_at_period_end,
      ...(scheduledMatched
        ? {
            scheduled_plan: null,
            scheduled_price_id: null,
            scheduled_change_at: null,
            stripe_schedule_id: null,
          }
        : {}),
      ...(hasPauseCollection
        ? {
            pause_ends_at: subscription.pause_collection?.resumes_at
              ? new Date(subscription.pause_collection.resumes_at * 1000).toISOString()
              : null,
          }
        : { paused_at: null, pause_ends_at: null }),
    })
    .eq("stripe_subscription_id", subscription.id);
}

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  await supabase
    .from("subscriptions")
    .update({ status: "canceled", cancel_at_period_end: false })
    .eq("stripe_subscription_id", subscription.id);
}

type PlanTierMeta = PlanTier;
const VALID_PLANS: PlanTierMeta[] = ["basic", "advanced", "integrated"];
const VALID_INTERVALS = ["month", "year"] as const;

function resolvePlanFromProduct(product: Stripe.Product): PlanTierMeta | null {
  const raw = (product.metadata?.plan ?? "").toLowerCase().trim();
  return (VALID_PLANS as string[]).includes(raw) ? (raw as PlanTierMeta) : null;
}

async function handleProductUpserted(product: Stripe.Product) {
  const plan = resolvePlanFromProduct(product);
  if (!plan) {
    console.warn(`product ${product.id}: missing/invalid metadata.plan; skipping plan refresh`);
    return;
  }
  const { error } = await supabase
    .from("stripe_products")
    .update({ plan })
    .eq("stripe_product_id", product.id);
  if (error) console.error("product update failed:", error.message);
}

async function handleProductDeleted(product: Stripe.Product) {
  const { error } = await supabase
    .from("stripe_products")
    .delete()
    .eq("stripe_product_id", product.id);
  if (error) console.error("product delete failed:", error.message);
}

async function handlePriceUpserted(price: Stripe.Price) {
  if (!price.recurring || !VALID_INTERVALS.includes(price.recurring.interval as typeof VALID_INTERVALS[number])) {
    console.warn(`price ${price.id}: not a supported recurring interval; skipping`);
    return;
  }
  const productId = typeof price.product === "string" ? price.product : price.product.id;
  const product = typeof price.product === "string"
    ? await stripe.products.retrieve(price.product)
    : (price.product as Stripe.Product);

  const plan = resolvePlanFromProduct(product);
  if (!plan) {
    console.warn(`price ${price.id}: parent product ${productId} missing metadata.plan; skipping`);
    return;
  }

  // Preserve existing payment_link_url if any.
  const { data: existing } = await supabase
    .from("stripe_products")
    .select("payment_link_url")
    .eq("stripe_price_id", price.id)
    .maybeSingle();

  const { error } = await supabase.from("stripe_products").upsert(
    {
      stripe_price_id: price.id,
      stripe_product_id: productId,
      plan,
      billing_interval: price.recurring.interval,
      unit_amount: price.unit_amount,
      currency: price.currency,
      ...(existing?.payment_link_url ? { payment_link_url: existing.payment_link_url } : {}),
    },
    { onConflict: "stripe_price_id" },
  );
  if (error) console.error("price upsert failed:", error.message);
}

async function handlePriceDeleted(price: Stripe.Price) {
  const { error } = await supabase
    .from("stripe_products")
    .delete()
    .eq("stripe_price_id", price.id);
  if (error) console.error("price delete failed:", error.message);
}

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string | null;
  if (!subscriptionId) return;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await handleSubscriptionChange(subscription);
  await supabase
    .from("subscriptions")
    .update({ status: "active" })
    .eq("stripe_subscription_id", subscriptionId);
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionId = invoice.subscription as string | null;
  if (!subscriptionId) return;

  // Try one automatic retry against the customer's default payment method.
  try {
    const paid = await stripe.invoices.pay(invoice.id);
    if (paid.status === "paid") {
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      await handleSubscriptionChange(subscription);
      await supabase
        .from("subscriptions")
        .update({ status: "active" })
        .eq("stripe_subscription_id", subscriptionId);
      return;
    }
  } catch (e) {
    console.warn("auto-retry invoice.pay failed:", (e as Error).message);
  }

  // Retry didn't succeed — mark past_due so the UI surfaces a payment problem.
  await supabase
    .from("subscriptions")
    .update({ status: "past_due" })
    .eq("stripe_subscription_id", subscriptionId);
}


Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const signature = req.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret);
  } catch (err) {
    console.error("Signature verification failed:", (err as Error).message);
    return new Response(`Webhook Error: ${(err as Error).message}`, { status: 400 });
  }

  // Idempotency: insert event id; conflict = already processed
  const { error: dupErr } = await supabase
    .from("stripe_webhook_events")
    .insert({ event_id: event.id, type: event.type, payload: event as unknown as Record<string, unknown> });
  if (dupErr && dupErr.code === "23505") {
    return new Response(JSON.stringify({ received: true, duplicate: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed":
        await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;
      case "customer.subscription.created":
        await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;
      case "invoice.paid":
        await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case "invoice.payment_failed":
        await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;

      case "customer.subscription.updated":
        await handleSubscriptionChange(event.data.object as Stripe.Subscription);
        break;
      case "customer.subscription.deleted":
        await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case "product.created":
      case "product.updated":
        await handleProductUpserted(event.data.object as Stripe.Product);
        break;
      case "product.deleted":
        await handleProductDeleted(event.data.object as Stripe.Product);
        break;
      case "price.created":
      case "price.updated":
        await handlePriceUpserted(event.data.object as Stripe.Price);
        break;
      case "price.deleted":
        await handlePriceDeleted(event.data.object as Stripe.Price);
        break;
      case "subscription_schedule.released":
      case "subscription_schedule.completed":
      case "subscription_schedule.canceled": {
        const sched = event.data.object as Stripe.SubscriptionSchedule;
        const subId = sched.subscription as string | null;
        if (subId) {
          await supabase
            .from("subscriptions")
            .update({
              scheduled_plan: null,
              scheduled_price_id: null,
              scheduled_change_at: null,
              stripe_schedule_id: null,
            })
            .eq("stripe_schedule_id", sched.id);
          // Re-sync from Stripe in case the price changed too.
          try {
            const fresh = await stripe.subscriptions.retrieve(subId);
            await handleSubscriptionChange(fresh);
          } catch (e) {
            console.warn("post-schedule refresh failed:", (e as Error).message);
          }
        }
        break;
      }
      default:
        console.log("Unhandled event type:", event.type);
    }
  } catch (err) {
    console.error("Handler error:", err);
    return new Response(`Handler error: ${(err as Error).message}`, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
