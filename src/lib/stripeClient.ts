import { loadStripe, type Stripe } from "@stripe/stripe-js";
import { supabase } from "@/integrations/supabase/client";

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = (async () => {
      const { data, error } = await supabase.functions.invoke<{ publishableKey: string }>(
        "stripe-config",
        { method: "GET" },
      );
      if (error || !data?.publishableKey) {
        console.error("Failed to load Stripe publishable key:", error);
        return null;
      }
      return loadStripe(data.publishableKey);
    })();
  }
  return stripePromise;
}
