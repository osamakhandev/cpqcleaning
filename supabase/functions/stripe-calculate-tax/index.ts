// Public endpoint: live tax preview using Stripe Tax for the selected price + address.
import Stripe from "https://esm.sh/stripe@14.21.0?target=denonext";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { z } from "https://esm.sh/zod@3.23.8";

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

const BodySchema = z.object({
  priceId: z.string().min(1).max(255),
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
  const { priceId } = parsed.data;
  const country = parsed.data.country.toUpperCase();
  const postalCode = parsed.data.postalCode?.trim() || undefined;

  // Look up the price
  const { data: priceRow, error: priceErr } = await supabase
    .from("stripe_products")
    .select("stripe_price_id, unit_amount, currency")
    .eq("stripe_price_id", priceId)
    .maybeSingle();
  if (priceErr || !priceRow?.unit_amount) {
    return json({ error: "unknown_price" }, 400);
  }

  const amount = priceRow.unit_amount;
  const currency = (priceRow.currency ?? "aud").toLowerCase();

  try {
    const calc = await stripe.tax.calculations.create({
      currency,
      line_items: [
        {
          amount,
          reference: priceId,
          tax_behavior: "exclusive",
        },
      ],
      customer_details: {
        address: {
          country,
          ...(postalCode ? { postal_code: postalCode } : {}),
        },
        address_source: "billing",
      },
    });

    const breakdown = (calc.tax_breakdown ?? []).map((b) => ({
      amount: b.amount,
      taxableAmount: b.taxable_amount,
      jurisdiction: b.jurisdiction?.display_name ?? "",
      percentage: b.tax_rate_details?.percentage_decimal
        ? Number(b.tax_rate_details.percentage_decimal)
        : null,
      displayName: b.tax_rate_details?.tax_type ?? "Tax",
    }));

    return json({
      subtotal: calc.amount_total - (calc.tax_amount_exclusive ?? 0),
      taxAmount: calc.tax_amount_exclusive ?? 0,
      total: calc.amount_total,
      currency: calc.currency,
      taxBreakdown: breakdown,
    });
  } catch (err) {
    console.error("Stripe tax calculation failed:", (err as Error).message);
    return json({ error: "tax_error", message: (err as Error).message }, 400);
  }
});
