// Public endpoint: lightweight email check to detect existing active subscriptions.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

const ACTIVE_STATUSES = ["trialing", "active", "past_due", "paused"];

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  let payload: { email?: string };
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const email = (payload.email ?? "").trim().toLowerCase();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) {
    return json({ error: "invalid_email" }, 400);
  }

  // Detect logged-in identity (optional)
  let loggedIn = false;
  let jwtEmail: string | null = null;
  const authHeader = req.headers.get("Authorization");
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice("Bearer ".length);
      const { data } = await supabase.auth.getClaims(token);
      const claimEmail = (data?.claims?.email as string | undefined)?.toLowerCase();
      if (claimEmail) {
        loggedIn = true;
        jwtEmail = claimEmail;
      }
    } catch {
      // ignore
    }
  }

  const { data: existing } = await supabase
    .from("subscriptions")
    .select("status")
    .eq("email", email)
    .in("status", ACTIVE_STATUSES)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return json({
    status: existing ? "active" : "none",
    loggedIn,
    matchesLoggedInUser: loggedIn && jwtEmail === email,
  });
});
