// Resubscribes a previously cancelled customer.
// Prefers a direct Stripe API call (subscriptions.create) when the customer
// already has a saved payment method. Falls back to a Checkout Session when
// no payment method is on file.
import Stripe from "https://esm.sh/stripe@14.21.0?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
  apiVersion: "2024-06-20",
  httpClient: Stripe.createFetchHttpClient(),
});

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabaseUser.auth.getUser();
    const user = userData.user;
    if (!user?.email) return json({ error: "Unauthorized" }, 401);

    const { priceId } = await req.json();
    if (!priceId || typeof priceId !== "string") {
      return json({ error: "priceId required" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: product } = await supabaseAdmin
      .from("stripe_products")
      .select("plan, stripe_price_id")
      .eq("stripe_price_id", priceId)
      .maybeSingle();
    if (!product) return json({ error: "Unknown price" }, 400);

    // Find existing customer (from our DB or Stripe by email)
    const { data: existingSub } = await supabaseAdmin
      .from("subscriptions")
      .select("id, stripe_customer_id")
      .or(`user_id.eq.${user.id},email.eq.${user.email.toLowerCase()}`)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let customerId = existingSub?.stripe_customer_id ?? null;
    if (!customerId) {
      const found = await stripe.customers.list({ email: user.email, limit: 1 });
      customerId = found.data[0]?.id ?? null;
    }

    const origin = req.headers.get("origin") ?? Deno.env.get("SITE_URL") ?? "";

    // Helper: build a Checkout Session as fallback
    const createCheckout = async () => {
      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${origin}/billing?resubscribed=1`,
        cancel_url: `${origin}/billing`,
        ...(customerId ? { customer: customerId } : { customer_email: user.email }),
        allow_promotion_codes: true,
        subscription_data: {
          metadata: { user_id: user.id, plan: product.plan },
        },
      });
      return json({ requiresCheckout: true, url: session.url });
    };

    if (!customerId) {
      // Brand-new payer; must collect card via Checkout
      return await createCheckout();
    }

    // Check if customer has a usable payment method
    const customer = await stripe.customers.retrieve(customerId);
    if ((customer as Stripe.DeletedCustomer).deleted) {
      customerId = null;
      return await createCheckout();
    }
    let defaultPm =
      (customer as Stripe.Customer).invoice_settings?.default_payment_method ?? null;
    if (!defaultPm) {
      const pms = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
      defaultPm = pms.data[0]?.id ?? null;
    }

    if (!defaultPm) {
      return await createCheckout();
    }

    // Direct API resubscribe — no redirect needed
    let newSub: Stripe.Subscription;
    try {
      newSub = await stripe.subscriptions.create({
        customer: customerId,
        items: [{ price: priceId }],
        default_payment_method: typeof defaultPm === "string" ? defaultPm : defaultPm.id,
        payment_behavior: "error_if_incomplete",
        proration_behavior: "create_prorations",
        metadata: { user_id: user.id, plan: product.plan },
      });
    } catch (err) {
      // Card declined / requires action — fall back to Checkout
      console.error("subscriptions.create failed, falling back to checkout:", (err as Error).message);
      return await createCheckout();
    }

    // Optimistically reflect in DB; webhook will reconcile
    const subRow = {
      user_id: user.id,
      email: user.email.toLowerCase(),
      plan: product.plan,
      status: newSub.status,
      stripe_customer_id: typeof newSub.customer === "string" ? newSub.customer : newSub.customer.id,
      stripe_subscription_id: newSub.id,
      stripe_price_id: priceId,
      current_period_end: newSub.current_period_end
        ? new Date(newSub.current_period_end * 1000).toISOString()
        : null,
      trial_start: null,
      trial_end: null,
      paused_at: null,
      pause_ends_at: null,
      updated_at: new Date().toISOString(),
    };

    if (existingSub?.id) {
      await supabaseAdmin.from("subscriptions").update(subRow).eq("id", existingSub.id);
    } else {
      await supabaseAdmin.from("subscriptions").insert(subRow);
    }

    await supabaseAdmin
      .from("profiles")
      .update({ plan_type: product.plan })
      .eq("id", user.id);

    return json({ ok: true, plan: product.plan, status: newSub.status });
  } catch (err) {
    console.error("stripe-resubscribe error:", (err as Error).message);
    return json({ error: (err as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
