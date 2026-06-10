import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import type { StripeElementsOptions } from "@stripe/stripe-js";
import { z } from "zod";
import { Loader2, CheckCircle2 } from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { getStripe } from "@/lib/stripeClient";
import { SITE_URL } from "@/lib/siteUrl";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";

type TaxPreview = {
  subtotal: number;
  taxAmount: number;
  total: number;
  currency: string;
  taxBreakdown: Array<{
    amount: number;
    percentage: number | null;
    displayName: string;
    jurisdiction: string;
  }>;
};

const PLANS = ["basic", "advanced", "integrated"] as const;
const INTERVALS = ["month", "year"] as const;
type Plan = (typeof PLANS)[number];
type Interval = (typeof INTERVALS)[number];

const FormSchema = z.object({
  fullName: z.string().trim().min(1, "Full name is required").max(100),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(255),
});

type PriceInfo = {
  stripe_price_id: string;
  unit_amount: number | null;
  currency: string | null;
};

function formatPrice(amount: number | null, currency: string | null) {
  if (amount == null) return "";
  const value = amount / 100;
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: (currency ?? "AUD").toUpperCase(),
    }).format(value);
  } catch {
    return `$${value.toFixed(2)}`;
  }
}

function planLabel(plan: Plan) {
  const labels: Record<Plan, string> = {
    basic: "CPQ Essentials",
    advanced: "CPQ Plus",
    integrated: "CPQ Integrated",
  };
  return labels[plan] ?? plan;
}

export default function Checkout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const plan = (params.get("plan") ?? "").toLowerCase() as Plan;
  const interval = (params.get("interval") ?? "month").toLowerCase() as Interval;
  const planValid = (PLANS as readonly string[]).includes(plan);
  const intervalValid = (INTERVALS as readonly string[]).includes(interval);

  const [price, setPrice] = useState<PriceInfo | null>(null);
  const [priceError, setPriceError] = useState<string | null>(null);
  const [stripePromise] = useState(() => getStripe());

  // Tax / billing location state
  const [country, setCountry] = useState<string>("");
  const [postalCode, setPostalCode] = useState<string>("");
  const [tax, setTax] = useState<TaxPreview | null>(null);
  const [taxLoading, setTaxLoading] = useState(false);
  const [taxError, setTaxError] = useState<string | null>(null);
  const taxSeq = useRef(0);

  // Live tax calculation
  useEffect(() => {
    setTax(null);
    setTaxError(null);
    if (!price?.stripe_price_id || !country) return;
    const seq = ++taxSeq.current;
    setTaxLoading(true);
    const t = setTimeout(async () => {
      try {
        const { data, error } = await supabase.functions.invoke<TaxPreview & { error?: string; message?: string }>(
          "stripe-calculate-tax",
          {
            body: {
              priceId: price.stripe_price_id,
              country,
            },
          },
        );
        if (seq !== taxSeq.current) return;
        if (error || (data as { error?: string })?.error) {
          setTaxError((data as { message?: string })?.message ?? "Unable to calculate tax for this location.");
        } else {
          setTax(data as TaxPreview);
        }
      } catch (err) {
        if (seq === taxSeq.current) {
          console.warn("tax calc failed:", err);
          setTaxError("Unable to calculate tax for this location.");
        }
      } finally {
        if (seq === taxSeq.current) setTaxLoading(false);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [price?.stripe_price_id, country]);

  useEffect(() => {
    document.title = "Checkout — CPQ";
  }, []);

  // Resolve price once
  useEffect(() => {
    if (!planValid || !intervalValid) return;
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("stripe_products")
        .select("stripe_price_id, unit_amount, currency")
        .eq("plan", plan)
        .eq("billing_interval", interval)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data?.stripe_price_id) {
        setPriceError("Plan unavailable. Please return to pricing and try again.");
      } else {
        setPrice(data as PriceInfo);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [plan, interval, planValid, intervalValid]);

  if (!planValid || !intervalValid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle>Invalid checkout link</CardTitle>
            <CardDescription>
              The plan you selected isn't recognised. Please return to the pricing page and try again.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const elementsOptions: StripeElementsOptions = useMemo(
    () => ({
      mode: "subscription",
      amount: price?.unit_amount ?? 0,
      currency: (price?.currency ?? "aud").toLowerCase(),
      paymentMethodTypes: ["card"],
      appearance: { theme: "stripe" },
    }),
    [price?.unit_amount, price?.currency],
  );

  return (
    <div className="min-h-screen bg-background py-10 px-4">
      <div className="mx-auto max-w-5xl grid gap-6 md:grid-cols-[1fr_360px]">
        <Card>
          <CardHeader>
            <CardTitle>Secure checkout</CardTitle>
            <CardDescription>Enter your details below to start your 7-day free trial.</CardDescription>
          </CardHeader>
          <CardContent>
            {priceError ? (
              <Alert variant="destructive">
                <AlertTitle>Unable to load plan</AlertTitle>
                <AlertDescription>{priceError}</AlertDescription>
              </Alert>
            ) : !price ? (
              <div className="flex items-center justify-center py-10 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : (
              <Elements stripe={stripePromise} options={elementsOptions}>
                <CheckoutForm
                  price={price}
                  prefilledEmail={user?.email ?? ""}
                  emailLocked={!!user?.email}
                  prefilledName={(user?.user_metadata?.full_name as string | undefined) ?? ""}
                  country={country}
                  setCountry={setCountry}
                  postalCode={postalCode}
                  setPostalCode={setPostalCode}
                  taxReady={!!tax && !taxLoading}
                  onAlreadySubscribed={(loggedIn) => {
                    toast.info("You already have an active subscription.");
                    if (loggedIn) {
                      navigate("/billing", { replace: true });
                    } else {
                      navigate("/auth", { replace: true, state: { from: "/billing" } });
                    }
                  }}
                />
              </Elements>
            )}
          </CardContent>
        </Card>

        <PlanSummary
          plan={plan}
          interval={interval}
          price={price}
          tax={tax}
          taxLoading={taxLoading}
          taxError={taxError}
          country={country}
        />
      </div>
    </div>
  );
}

function PlanSummary({
  plan,
  interval,
  price,
  tax,
  taxLoading,
  taxError,
  country,
}: {
  plan: Plan;
  interval: Interval;
  price: PriceInfo | null;
  tax: TaxPreview | null;
  taxLoading: boolean;
  taxError: string | null;
  country: string;
}) {
  const currency = tax?.currency ?? price?.currency ?? "aud";
  const subtotal = tax?.subtotal ?? price?.unit_amount ?? null;
  const total = tax?.total ?? price?.unit_amount ?? null;
  const intervalSuffix = interval === "month" ? "/mo" : "/yr";
  const primaryTaxLabel = tax?.taxBreakdown?.[0]?.displayName ? tax.taxBreakdown[0].displayName.toUpperCase() : "Tax";
  const primaryTaxPct = tax?.taxBreakdown?.[0]?.percentage;

  return (
    <Card className="h-fit md:sticky md:top-6">
      <CardHeader>
        <CardTitle>{planLabel(plan)}</CardTitle>
        <CardDescription>Billed {interval === "month" ? "monthly" : "annually"}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2 text-sm">
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="font-medium">
              {subtotal != null ? formatPrice(subtotal, currency) : "—"}
              <span className="ml-1 text-xs font-normal text-muted-foreground">{intervalSuffix}</span>
            </span>
          </div>
          <div className="flex items-baseline justify-between">
            <span className="text-muted-foreground">
              {tax ? `${primaryTaxLabel}${primaryTaxPct != null ? ` (${primaryTaxPct}%)` : ""}` : "Tax"}
            </span>
            <span className="font-medium flex items-center gap-2">
              {taxLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
              ) : tax ? (
                formatPrice(tax.taxAmount, currency)
              ) : !country ? (
                <span className="text-xs text-muted-foreground">Select country</span>
              ) : taxError ? (
                <span className="text-xs text-muted-foreground">—</span>
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </span>
          </div>
          <div className="border-t pt-2 flex items-baseline justify-between">
            <span className="font-semibold">Total due {interval === "month" ? "monthly" : "yearly"}</span>
            <span className="text-xl font-semibold">{total != null ? formatPrice(total, currency) : "—"}</span>
          </div>
          {taxError && <p className="text-xs text-destructive">{taxError}</p>}
        </div>
        <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">7-day free trial — no charge today.</div>
        <p className="text-xs text-muted-foreground">Cancel anytime. Powered by Stripe.</p>
      </CardContent>
    </Card>
  );
}

type CheckoutFormProps = {
  price: PriceInfo;
  prefilledEmail: string;
  emailLocked: boolean;
  prefilledName: string;
  country: string;
  setCountry: (v: string) => void;
  postalCode: string;
  setPostalCode: (v: string) => void;
  taxReady: boolean;
  onAlreadySubscribed: (loggedIn: boolean) => void;
};

function CheckoutForm({
  price,
  prefilledEmail,
  emailLocked,
  prefilledName,
  country,
  setCountry,
  postalCode,
  setPostalCode,
  taxReady,
  onAlreadySubscribed,
}: CheckoutFormProps) {
  const stripe = useStripe();
  const elements = useElements();

  const [fullName, setFullName] = useState(prefilledName);
  const [email, setEmail] = useState(prefilledEmail);
  const [fieldErrors, setFieldErrors] = useState<{ fullName?: string; email?: string }>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [emailChecking, setEmailChecking] = useState(false);
  const [duplicateEmail, setDuplicateEmail] = useState(false);
  const [emailValidating, setEmailValidating] = useState(false);
  const [emailValid, setEmailValid] = useState<boolean | null>(emailLocked ? true : null);
  const [agreed, setAgreed] = useState(false);
  const checkSeq = useRef(0);
  const validateSeq = useRef(0);

  const EMAIL_INVALID_MSG =
    "Please enter a valid email address. Temporary or inactive emails are not allowed.";

  // Debounced duplicate check + deliverability validation on email change
  useEffect(() => {
    setDuplicateEmail(false);
    const trimmed = email.trim().toLowerCase();
    if (trimmed.length === 0) {
      setEmailValid(null);
      setFieldErrors((prev) => (prev.email ? { ...prev, email: undefined } : prev));
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setEmailValid(false);
      setFieldErrors((prev) => ({ ...prev, email: EMAIL_INVALID_MSG }));
      return;
    }
    // If the field is locked to the logged-in user's email, skip remote validation.
    if (emailLocked) {
      setEmailValid(true);
      setFieldErrors((prev) => (prev.email ? { ...prev, email: undefined } : prev));
      return;
    }

    const seq = ++checkSeq.current;
    const vseq = ++validateSeq.current;
    setEmailChecking(true);
    setEmailValidating(true);
    setEmailValid(null);

    const t = setTimeout(async () => {
      // Run both checks in parallel
      const dupPromise = supabase.functions
        .invoke<{ status: "active" | "none"; loggedIn: boolean; matchesLoggedInUser: boolean }>(
          "stripe-check-subscription",
          { body: { email: trimmed } },
        )
        .then(({ data }) => {
          if (seq !== checkSeq.current) return;
          if (data?.status === "active") {
            setDuplicateEmail(true);
            setTimeout(() => onAlreadySubscribed(!!data.matchesLoggedInUser), 1200);
          }
        })
        .catch((err) => console.warn("subscription check failed:", err))
        .finally(() => {
          if (seq === checkSeq.current) setEmailChecking(false);
        });

      const validatePromise = supabase.functions
        .invoke<{ ok: boolean; reason?: string; message?: string }>("validate-email", {
          body: { email: trimmed },
        })
        .then(({ data, error }) => {
          if (vseq !== validateSeq.current) return;
          if (error || !data) {
            // Don't block on transient server errors; allow submit-time enforcement.
            setEmailValid(true);
            return;
          }
          if (data.ok) {
            setEmailValid(true);
            setFieldErrors((prev) => (prev.email === EMAIL_INVALID_MSG ? { ...prev, email: undefined } : prev));
          } else {
            setEmailValid(false);
            setFieldErrors((prev) => ({ ...prev, email: EMAIL_INVALID_MSG }));
          }
        })
        .catch((err) => {
          console.warn("email validation failed:", err);
          if (vseq === validateSeq.current) setEmailValid(true);
        })
        .finally(() => {
          if (vseq === validateSeq.current) setEmailValidating(false);
        });

      await Promise.all([dupPromise, validatePromise]);
    }, 450);
    return () => clearTimeout(t);
  }, [email, emailLocked, onAlreadySubscribed]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const parsed = FormSchema.safeParse({ fullName, email });
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setFieldErrors({
        fullName: flat.fullName?.[0],
        email: flat.email?.[0],
      });
      return;
    }
    setFieldErrors({});

    if (emailValid === false) {
      setFieldErrors({ email: EMAIL_INVALID_MSG });
      return;
    }
    if (emailValidating) {
      setSubmitError("Please wait while we verify your email address.");
      return;
    }

    if (!agreed) {
      setSubmitError("You must agree to the Terms of Service and Privacy Policy.");
      return;
    }

    if (!country) {
      setSubmitError("Please select your billing country.");
      return;
    }

    if (!stripe || !elements) return;

    setSubmitting(true);
    try {
      // Trigger Elements validation
      const { error: submitErr } = await elements.submit();
      if (submitErr) {
        setSubmitError(submitErr.message ?? "Please check your card details.");
        return;
      }

      // Create subscription server-side
      const { data, error } = await supabase.functions.invoke<{
        clientSecret: string;
        intentType: "setup" | "payment";
        error?: string;
        loggedIn?: boolean;
      }>("stripe-create-subscription", {
        body: {
          priceId: price.stripe_price_id,
          fullName: parsed.data.fullName,
          email: parsed.data.email,
          country,
          postalCode: postalCode.trim() || null,
        },
      });

      if (error) {
        const ctx = (error as { context?: Response }).context;
        if (ctx?.status === 409) {
          onAlreadySubscribed(false);
          return;
        }
        console.error("stripe-create-subscription error:", error, "data:", data);
        throw error;
      }

      if (data?.error === "already_subscribed") {
        onAlreadySubscribed(!!data.loggedIn);
        return;
      }

      if (data?.error === "invalid_email") {
        setEmailValid(false);
        setFieldErrors({ email: EMAIL_INVALID_MSG });
        return;
      }

      if (data?.error) {
        console.error("stripe-create-subscription returned error:", data);
        throw new Error((data as { message?: string }).message ?? data.error);
      }

      if (!data?.clientSecret) {
        console.error("No client secret in response:", data);
        throw new Error("Could not initialise payment.");
      }

      const returnUrl = `${SITE_URL}/thank-you`;
      const confirmParams = {
        return_url: returnUrl,
        payment_method_data: {
          billing_details: {
            name: parsed.data.fullName,
            email: parsed.data.email,
            phone: "",
            address: {
              country,
              postal_code: postalCode.trim() || "",
              line1: "",
              line2: "",
              city: "",
              state: "",
            },
          },
        },
      };

      const confirmResult =
        data.intentType === "setup"
          ? await stripe.confirmSetup({
              elements,
              clientSecret: data.clientSecret,
              confirmParams,
              redirect: "if_required",
            })
          : await stripe.confirmPayment({
              elements,
              clientSecret: data.clientSecret,
              confirmParams,
              redirect: "if_required",
            });

      if (confirmResult.error) {
        console.error("Stripe confirm error:", confirmResult.error);
        setSubmitError(confirmResult.error.message ?? "Payment failed. Please try again.");
        return;
      }

      // Success — webhook will provision approved_users + invite. Send to thank-you.
      window.location.href = returnUrl;
    } catch (err) {
      console.error("Checkout submit error:", err);
      const msg = err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setSubmitError(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="fullName">Full name</Label>
        <Input
          id="fullName"
          value={fullName}
          onChange={(e) => setFullName(e.target.value)}
          placeholder="Jane Smith"
          autoComplete="name"
          required
        />
        {fieldErrors.fullName && <p className="text-xs text-destructive">{fieldErrors.fullName}</p>}
      </div>

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <div className="relative">
          <Input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => {
              const trimmed = email.trim().toLowerCase();
              if (trimmed.length > 0 && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
                setEmailValid(false);
                setFieldErrors((prev) => ({ ...prev, email: EMAIL_INVALID_MSG }));
              }
            }}
            placeholder="you@company.com"
            autoComplete="email"
            disabled={emailLocked}
            aria-invalid={emailValid === false}
            required
          />
          {(emailChecking || emailValidating) ? (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          ) : emailValid === true && !emailLocked && email.trim().length > 0 ? (
            <CheckCircle2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-green-600" />
          ) : null}
        </div>
        {emailValid === false && !emailValidating && (
          <Alert variant="destructive">
            <AlertTitle>Invalid email address</AlertTitle>
            <AlertDescription>{fieldErrors.email ?? EMAIL_INVALID_MSG}</AlertDescription>
          </Alert>
        )}
        {fieldErrors.email && emailValid !== false && (
          <p className="text-xs text-destructive">{fieldErrors.email}</p>
        )}
      </div>

      {duplicateEmail && (
        <Alert>
          <AlertTitle>Subscription already active</AlertTitle>
          <AlertDescription>This email already has an active subscription. Redirecting you now…</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label>Card details</Label>
        <div className="rounded-md border p-3">
          <PaymentElement
            options={{
              layout: "tabs",
              fields: {
                billingDetails: {
                  name: "never",
                  email: "never",
                  phone: "never",
                  address: {
                    country: "auto",
                    postalCode: "auto",
                    line1: "never",
                    line2: "never",
                    city: "never",
                    state: "never",
                  },
                },
              },
            }}
            onChange={(event) => {
              const addr = event.value?.billingDetails?.address;
              const c = (addr?.country ?? "").toUpperCase();
              if (c && c !== country) setCountry(c);
              const pc = addr?.postalCode ?? "";
              if (pc !== postalCode) setPostalCode(pc);
            }}
          />
        </div>
      </div>

      {submitError && (
        <Alert variant="destructive">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <div className="flex items-start gap-2">
        <Checkbox id="agree-terms" checked={agreed} onCheckedChange={(v) => setAgreed(v === true)} className="mt-0.5" />
        <Label htmlFor="agree-terms" className="text-sm font-normal leading-snug">
          I agree to Cleaning Price Quick CPQ's{" "}
          <a
            href="https://www.cleaningpq.com.au/terms-and-conditions"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-primary"
          >
            Terms of Service
          </a>{" "}
          and{" "}
          <a
            href="https://www.cleaningpq.com.au/privacy-policy"
            target="_blank"
            rel="noopener noreferrer"
            className="underline text-primary"
          >
            Privacy Policy
          </a>
          .
        </Label>
      </div>

      <Button
        type="submit"
        className="w-full"
        disabled={!stripe || !elements || submitting || duplicateEmail || !agreed || emailValid === false || emailValidating}
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Processing…
          </>
        ) : (
          "Start 7-day free trial"
        )}
      </Button>

      <p className="text-center text-xs text-muted-foreground">
        You won't be charged until your trial ends. Cancel anytime.
      </p>
    </form>
  );
}
