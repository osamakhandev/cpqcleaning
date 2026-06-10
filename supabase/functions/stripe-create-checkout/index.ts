// Public endpoint: create a Stripe Checkout Session with a 7-day trial.
// Used ONLY for first-time signups and resubscribes after cancellation.
// Plan changes for existing active subscribers go through stripe-update-subscription.
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

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const SITE_URL =
  Deno.env.get("SITE_URL") ?? "https://cpq-web-master-v1-1.lovable.app";

const ACTIVE_STATUSES = ["trialing", "active", "past_due", "paused"];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "method_not_allowed" }, 405);

  let payload: { priceId?: string; email?: string; fullName?: string };
  try {
    payload = await req.json();
  } catch {
    return jsonResponse({ error: "invalid_json" }, 400);
  }

  const priceId = (payload.priceId ?? "").trim();
  if (!priceId) return jsonResponse({ error: "missing_priceId" }, 400);

  const fullName = (payload.fullName ?? "").trim().slice(0, 100) || null;

  // Resolve identity: prefer the JWT if provided.
  let loggedIn = false;
  let email = (payload.email ?? "").trim().toLowerCase();
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

  // Validate price exists in our catalog
  const { data: priceRow, error: priceErr } = await supabase
    .from("stripe_products")
    .select("stripe_price_id")
    .eq("stripe_price_id", priceId)
    .maybeSingle();
  if (priceErr) {
    console.error("price lookup error:", priceErr.message);
    return jsonResponse({ error: "price_lookup_failed" }, 500);
  }
  if (!priceRow) return jsonResponse({ error: "unknown_price" }, 400);

  // Block: anyone with an active sub must use the in-place update endpoint instead.
  if (email) {
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("status")
      .eq("email", email)
      .in("status", ACTIVE_STATUSES)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existing) {
      return jsonResponse({ error: "already_subscribed", loggedIn }, 409);
    }
  }

  // Has the email previously had a Stripe subscription (now canceled)?
  // If so, this is a resubscribe — reuse the customer and DO NOT grant a new trial.
  let resubscribeCustomerId: string | null = null;
  if (email) {
    const { data: prior } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("email", email)
      .not("stripe_customer_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    resubscribeCustomerId = prior?.stripe_customer_id ?? null;
  }

  const isResubscribe = !!resubscribeCustomerId;

  try {
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        // Trial allowed only on a customer's first-ever subscription.
        ...(isResubscribe ? {} : { trial_period_days: 7 }),
        ...(fullName ? { metadata: { full_name: fullName } } : {}),
      },
      ...(fullName ? { metadata: { full_name: fullName } } : {}),
      ...(resubscribeCustomerId
        ? { customer: resubscribeCustomerId }
        : email
        ? { customer_email: email }
        : {}),
      success_url: `${SITE_URL}/thank-you?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${SITE_URL}/plans`,
      allow_promotion_codes: true,
    });
    return jsonResponse({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout creation failed:", (err as Error).message);
    return jsonResponse({ error: "stripe_error", message: (err as Error).message }, 500);
  }
});
