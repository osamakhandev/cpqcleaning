// One-off backfill: ensures each subscription has a corresponding auth user + profile.
// Public endpoint guarded by a shared secret header `x-backfill-token` matching STRIPE_WEBHOOK_SECRET
// (just reusing an existing secret to avoid asking for a new one).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-backfill-token",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const token = req.headers.get("x-backfill-token");
  if (!token || token !== Deno.env.get("STRIPE_WEBHOOK_SECRET")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: subs, error } = await supabase
    .from("subscriptions")
    .select("id, email, plan, user_id");
  if (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const results: Array<Record<string, unknown>> = [];

  for (const sub of subs ?? []) {
    const email = (sub.email as string).toLowerCase();
    let userId = sub.user_id as string | null;

    if (!userId) {
      const { data: list } = await supabase.auth.admin.listUsers();
      const found = list?.users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (found) {
        userId = found.id;
      } else {
        const { data: created, error: createErr } = await supabase.auth.admin.createUser({
          email,
          email_confirm: true,
        });
        if (createErr) {
          results.push({ email, status: "create_failed", error: createErr.message });
          continue;
        }
        userId = created.user?.id ?? null;
      }
    }

    if (!userId) {
      results.push({ email, status: "no_user" });
      continue;
    }

    // Ensure profile exists with the subscription's plan
    await supabase
      .from("profiles")
      .upsert({ id: userId, email, plan_type: sub.plan }, { onConflict: "id" });

    // Sync user_id on the subscription
    if (sub.user_id !== userId) {
      await supabase.from("subscriptions").update({ user_id: userId }).eq("id", sub.id);
    }

    results.push({ email, status: "ok", userId });
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    status: 200,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
