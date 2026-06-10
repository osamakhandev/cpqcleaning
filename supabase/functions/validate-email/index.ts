// Public endpoint: validate an email address for malformed / disposable / undeliverable.
import { validateEmail, EMAIL_ERROR_MESSAGE } from "../_shared/validateEmail.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, reason: "method_not_allowed" }, 405);

  let body: { email?: string };
  try {
    body = await req.json();
  } catch {
    return json({ ok: false, reason: "malformed", message: EMAIL_ERROR_MESSAGE }, 400);
  }

  const result = await validateEmail(body.email ?? "");
  if (result.ok) return json({ ok: true });
  return json({ ok: false, reason: result.reason, message: EMAIL_ERROR_MESSAGE });
});
