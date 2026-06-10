// Public endpoint: create a Stripe Subscription with default_incomplete + trial,
// returning a SetupIntent (or PaymentIntent) client secret for Stripe Elements.
import Stripe from "https://esm.sh/stripe@14.21.0?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";
import { validateEmail, EMAIL_ERROR_MESSAGE } from "../_shared/validateEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const ACTIVE_STATUSES = ["trialing", "active", "past_due", "paused"];

const BodySchema = z.object({
  priceId: z.string().min(1).max(255),
  fullName: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email().max(255),
  country: z.string().trim().length(2),
  postalCode: z.string().trim().max(20).optional().nullable(),
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: "invalid_input", details: parsed.error.flatten().fieldErrors }, 400);
  }
  let { priceId, fullName, email } = parsed.data;
  const country = parsed.data.country.toUpperCase();
  const postalCode = parsed.data.postalCode?.trim() || undefined;

  // Prefer JWT email if logged in
  let loggedIn = false;
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice("Bearer ".length);
      const { data } = await supabase.auth.getClaims(token);
      const claimEmail = (data?.claims?.email as string | undefined)?.toLowerCase();
      if (claimEmail) {
        email = claimEmail;
        loggedIn = true;
      }
    } catch (err) {
      console.warn("getClaims failed:", (err as Error).message);
    }
  }

  // Server-side email validation (malformed / disposable / undeliverable)
  const emailCheck = await validateEmail(email);
  if (!emailCheck.ok) {
    return json({ error: "invalid_email", reason: emailCheck.reason, message: EMAIL_ERROR_MESSAGE }, 400);
  }
  email = emailCheck.email;

  // Validate price exists in our catalog
  const { data: priceRow, error: priceErr } = await supabase
    .from("stripe_products")
    .select("stripe_price_id")
    .eq("stripe_price_id", priceId)
    .maybeSingle();
  if (priceErr) {
    console.error("price lookup error:", priceErr.message);
    return json({ error: "price_lookup_failed" }, 500);
  }
  if (!priceRow) return json({ error: "unknown_price" }, 400);

  // Active sub guard
  const { data: existing } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("email", email)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (existing) {
    return json({ error: "already_subscribed", loggedIn }, 409);
  }

  // Resubscribe? Reuse existing customer, no new trial.
  const { data: prior } = await supabase
    .from("subscriptions")
    .select("stripe_customer_id")
    .eq("email", email)
    .not("stripe_customer_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let customerId = prior?.stripe_customer_id ?? null;
  let isResubscribe = !!customerId;

  try {
    const customerAddress = {
      country,
      ...(postalCode ? { postal_code: postalCode } : {}),
    };

    // Verify the prior customer still exists in this Stripe account/mode.
    if (customerId) {
      try {
        const existingCust = await stripe.customers.retrieve(customerId);
        if ((existingCust as Stripe.DeletedCustomer).deleted) {
          customerId = null;
          isResubscribe = false;
        }
      } catch (err) {
        const code = (err as { code?: string }).code;
        if (code === "resource_missing") {
          console.warn(`Stale stripe_customer_id ${customerId} for ${email}; creating new customer.`);
          customerId = null;
          isResubscribe = false;
        } else {
          throw err;
        }
      }
    }

    // Try to find an existing Stripe customer by email before creating a new one.
    if (!customerId) {
      const found = await stripe.customers.list({ email, limit: 1 });
      if (found.data[0]) {
        customerId = found.data[0].id;
      }
    }

    if (!customerId) {
      const customer = await stripe.customers.create({
        email,
        name: fullName,
        address: customerAddress,
        metadata: { full_name: fullName },
      });
      customerId = customer.id;
    } else {
      await stripe.customers.update(customerId, {
        name: fullName,
        address: customerAddress,
      });
    }

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: priceId }],
      ...(isResubscribe ? {} : { trial_period_days: 7 }),
      automatic_tax: { enabled: true },
      payment_behavior: "default_incomplete",
      payment_settings: {
        save_default_payment_method: "on_subscription",
        payment_method_types: ["card"],
      },
      expand: ["pending_setup_intent", "latest_invoice.payment_intent"],
      metadata: { full_name: fullName },
    });

    let clientSecret: string | null = null;
    let intentType: "setup" | "payment" = "setup";

    const setupIntent = (subscription as unknown as {
      pending_setup_intent: Stripe.SetupIntent | null;
    }).pending_setup_intent;

    if (setupIntent && typeof setupIntent !== "string") {
      clientSecret = setupIntent.client_secret;
      intentType = "setup";
    } else {
      const invoice = subscription.latest_invoice as Stripe.Invoice | null;
      const pi = invoice?.payment_intent as Stripe.PaymentIntent | null | undefined;
      if (pi && typeof pi !== "string") {
        clientSecret = pi.client_secret;
        intentType = "payment";
      }
    }

    if (!clientSecret) {
      return json({ error: "no_client_secret" }, 500);
    }

    return json({
      clientSecret,
      intentType,
      subscriptionId: subscription.id,
      customerId,
      isResubscribe,
    });
  } catch (err) {
    console.error("Stripe subscription creation failed:", (err as Error).message);
    return json({ error: "stripe_error", message: (err as Error).message }, 500);
  }
});
