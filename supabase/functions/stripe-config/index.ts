// Public endpoint: returns the Stripe publishable key for the frontend Elements.
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  const publishableKey = Deno.env.get("STRIPE_PUBLISHABLE_KEY") ?? "";
  return new Response(JSON.stringify({ publishableKey }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
    status: 200,
  });
});
