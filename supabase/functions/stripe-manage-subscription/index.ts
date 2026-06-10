// Pause / resume / cancel the caller's active Stripe subscription.
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

const PAUSE_DAYS = 30;
const PAUSE_QUOTA_PER_YEAR = 2;
const PAUSE_WINDOW_DAYS = 365;

type Action = "pause" | "resume" | "cancel" | "reactivate";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData } = await supabaseUser.auth.getUser();
    const user = userData.user;
    if (!user?.email) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = body?.action as Action | undefined;
    if (!action || !["pause", "resume", "cancel", "reactivate"].includes(action)) {
      return json({ error: "Invalid action" }, 400);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } },
    );

    const { data: sub } = await supabaseAdmin
      .from("subscriptions")
      .select(
        "id, stripe_subscription_id, status, plan, paused_at, pause_ends_at, pause_days_used, current_period_end, pause_count_in_window, pause_window_start",
      )
      .or(`user_id.eq.${user.id},email.eq.${user.email.toLowerCase()}`)
      .neq("status", "canceled")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!sub?.stripe_subscription_id) {
      return json({ error: "No active subscription found" }, 400);
    }

    const stripeSubId = sub.stripe_subscription_id;

    if (action === "pause") {
      // Quota check (rolling 365-day window)
      const now = Date.now();
      let count = sub.pause_count_in_window ?? 0;
      let windowStart = sub.pause_window_start ? new Date(sub.pause_window_start).getTime() : null;
      if (windowStart && now - windowStart > PAUSE_WINDOW_DAYS * 86400_000) {
        count = 0;
        windowStart = null;
      }
      if (count >= PAUSE_QUOTA_PER_YEAR) {
        const nextAvailable = windowStart
          ? new Date(windowStart + PAUSE_WINDOW_DAYS * 86400_000).toISOString()
          : null;
        return json(
          {
            error: `Pause limit reached (${PAUSE_QUOTA_PER_YEAR} per year).${
              nextAvailable ? ` Next pause available after ${new Date(nextAvailable).toLocaleDateString("en-AU")}.` : ""
            }`,
          },
          400,
        );
      }

      // Pause begins at the end of the current paid period; auto-resume PAUSE_DAYS later.
      const periodEndMs = sub.current_period_end
        ? new Date(sub.current_period_end).getTime()
        : now;
      const pauseStartMs = Math.max(periodEndMs, now);
      const resumesAt = Math.floor((pauseStartMs + PAUSE_DAYS * 86400_000) / 1000);

      const updated = await stripe.subscriptions.update(stripeSubId, {
        pause_collection: { behavior: "void", resumes_at: resumesAt },
      });

      const nowIso = new Date().toISOString();
      await supabaseAdmin
        .from("subscriptions")
        .update({
          // Do NOT flip status to "paused" yet — user keeps access until period end.
          // The webhook (or the period boundary) governs the actual paused status.
          paused_at: new Date(pauseStartMs).toISOString(),
          pause_ends_at: new Date(resumesAt * 1000).toISOString(),
          pause_count_in_window: count + 1,
          pause_window_start: windowStart ? new Date(windowStart).toISOString() : nowIso,
          updated_at: nowIso,
        })
        .eq("id", sub.id);

      return json({
        ok: true,
        scheduled: pauseStartMs > now,
        pause_starts_at: new Date(pauseStartMs).toISOString(),
        pause_ends_at: new Date(resumesAt * 1000).toISOString(),
        stripe_status: updated.status,
      });
    }

    if (action === "resume") {
      const updated = await stripe.subscriptions.update(stripeSubId, {
        pause_collection: "",
        cancel_at_period_end: false,
      } as unknown as Stripe.SubscriptionUpdateParams);

      await supabaseAdmin
        .from("subscriptions")
        .update({
          status: updated.status,
          paused_at: null,
          pause_ends_at: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sub.id);

      return json({ ok: true, status: updated.status });
    }

    if (action === "reactivate") {
      const updated = await stripe.subscriptions.update(stripeSubId, {
        cancel_at_period_end: false,
      });
      await supabaseAdmin
        .from("subscriptions")
        .update({
          cancel_at_period_end: false,
          status: updated.status,
          updated_at: new Date().toISOString(),
        })
        .eq("id", sub.id);
      return json({ ok: true, status: updated.status, cancel_at_period_end: false });
    }

    // cancel — schedule cancellation at end of current period (keep access until then)
    const updated = await stripe.subscriptions.update(stripeSubId, {
      cancel_at_period_end: true,
    });
    const periodEndIso = new Date(updated.current_period_end * 1000).toISOString();
    await supabaseAdmin
      .from("subscriptions")
      .update({
        cancel_at_period_end: true,
        current_period_end: periodEndIso,
        updated_at: new Date().toISOString(),
      })
      .eq("id", sub.id);

    return json({
      ok: true,
      status: updated.status,
      cancel_at_period_end: true,
      current_period_end: periodEndIso,
    });
  } catch (err) {
    return json({ error: (err as Error).message }, 500);
  }
});

function json(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
