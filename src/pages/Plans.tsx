import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type PlanKey = "basic" | "advanced" | "integrated";
type Interval = "month" | "year";

interface ProductRow {
  plan: PlanKey;
  stripe_price_id: string;
  billing_interval: Interval;
  unit_amount: number | null;
  currency: string | null;
}

interface PlanMeta {
  key: PlanKey;
  name: string;
  tagline: string;
  features: string[];
  highlight?: boolean;
}

const PLAN_META: PlanMeta[] = [
  {
    key: "basic",
    name: "Essentials",
    tagline:
      "This starter package for cleaning services provides the essentials you need to complete your customer’s pricing schedules, including:",
    features: [
      "Template to build and price your cleaning roster, linked to the current Cleaning Award",
      "A weekly labour roster that you can analyse and adjust (for your operational ‘reality check’)",
      "Price and labour breakdowns of service delivery by operator or service area",
      "Executive Summary with key data and graphs for executive approval and sign off",
      "Calculates pricing impact for contracts starting post 30 June",
    ],
  },
  {
    key: "advanced",
    name: "Plus",
    tagline: "Includes the CPQ Essentials package and:",
    features: [
      "Calculates pricing impact for fixed-price contracts (up to 10 years)",
      "Sundry expenses calculator for items like equipment amortisation, uniforms, fuel and communication",
      "Price and labour breakdowns of service delivery by operator or service area",
      "Template of common periodical and specialist services like sanitary, pest control and window cleaning",
    ],
  },
  {
    key: "integrated",
    name: "Integrated",
    tagline: "Includes the Essentials and Plus packages and:",
    features: [
      "Service scope and pricing modules for security, maintenance and management services",
      "Wage settings for maintenance and management labour categories",
      "Daily Operational Board with dashboard display",
      "Template for assessing and reviewing your labour allocation",
    ],
  },
];

const formatPrice = (amount: number | null, currency: string | null) => {
  if (amount == null) return "—";
  try {
    return new Intl.NumberFormat("en-AU", {
      style: "currency",
      currency: (currency ?? "aud").toUpperCase(),
      minimumFractionDigits: 0,
    }).format(amount / 100);
  } catch {
    return `$${(amount / 100).toFixed(0)}`;
  }
};

export default function Plans() {
  const navigate = useNavigate();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [interval, setInterval] = useState<Interval>("month");
  const [buying, setBuying] = useState<string | null>(null);
  const [emailDialog, setEmailDialog] = useState<{ open: boolean; priceId: string | null }>({
    open: false,
    priceId: null,
  });
  const [emailInput, setEmailInput] = useState("");

  useEffect(() => {
    document.title = "Plans & Pricing — CPQ";
    void (async () => {
      const { data, error } = await supabase
        .from("stripe_products")
        .select("plan, stripe_price_id, billing_interval, unit_amount, currency");
      if (error) {
        toast.error("Failed to load pricing");
      } else {
        setProducts((data ?? []) as ProductRow[]);
      }
      setLoading(false);
    })();
  }, []);

  const priceFor = (plan: PlanKey) => products.find((p) => p.plan === plan && p.billing_interval === interval) ?? null;

  const startCheckout = async (priceId: string, email?: string) => {
    setBuying(priceId);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const headers: Record<string, string> = {};
      if (sessionData.session?.access_token) {
        headers.Authorization = `Bearer ${sessionData.session.access_token}`;
      }
      const { data, error } = await supabase.functions.invoke("stripe-create-checkout", {
        body: { priceId, email },
        headers,
      });
      if (error) {
        // FunctionsHttpError surfaces non-2xx; try to read message
        const ctx = (error as unknown as { context?: Response }).context;
        if (ctx) {
          try {
            const body = await ctx.clone().json();
            if (body?.error === "already_subscribed") {
              toast.info("You already have an active subscription.");
              navigate(body.loggedIn ? "/billing" : "/auth");
              return;
            }
          } catch {
            /* ignore */
          }
        }
        throw error;
      }
      if ((data as { error?: string })?.error === "already_subscribed") {
        toast.info("You already have an active subscription.");
        navigate((data as { loggedIn?: boolean }).loggedIn ? "/billing" : "/auth");
        return;
      }
      const url = (data as { url?: string })?.url;
      if (!url) throw new Error("No checkout URL returned");
      window.location.href = url;
    } catch (err) {
      toast.error((err as Error).message ?? "Could not start checkout");
    } finally {
      setBuying(null);
    }
  };

  const handleBuy = async (priceId: string) => {
    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) {
      void startCheckout(priceId);
    } else {
      setEmailInput("");
      setEmailDialog({ open: true, priceId });
    }
  };

  const submitEmailDialog = async () => {
    const email = emailInput.trim();
    if (!email) {
      toast.error("Please enter your email");
      return;
    }
    const priceId = emailDialog.priceId;
    setEmailDialog({ open: false, priceId: null });
    if (priceId) await startCheckout(priceId, email);
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <h1 className="text-xl font-semibold">CPQ Plans</h1>
          <Button variant="ghost" onClick={() => navigate("/auth")}>
            Log in
          </Button>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="text-center mb-10">
          <h2 className="text-4xl font-bold mb-3">Choose your plan</h2>
          <p className="text-muted-foreground text-lg">
            Every paid plan starts with a <strong>7-day free trial</strong>. Cancel anytime.
          </p>
        </div>

        <div className="flex justify-center mb-10">
          <Tabs value={interval} onValueChange={(v) => setInterval(v as Interval)}>
            <TabsList>
              <TabsTrigger value="month">Monthly</TabsTrigger>
              <TabsTrigger value="year">Yearly</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Free Trial card (informational) */}
            <Card className="flex flex-col">
              <CardHeader>
                <Badge variant="secondary" className="w-fit mb-2">
                  Free
                </Badge>
                <CardTitle>7-Day Free Trial</CardTitle>
                <CardDescription>Try every feature, no payment now</CardDescription>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <div className="mb-4">
                  <span className="text-4xl font-bold">$0</span>
                  <span className="text-muted-foreground"> / 7 days</span>
                </div>
                <ul className="space-y-2 text-sm mb-6 flex-1">
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    Full feature access
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    No charge for 7 days
                  </li>
                  <li className="flex gap-2">
                    <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                    Cancel anytime
                  </li>
                </ul>
                <p className="text-xs text-muted-foreground">
                  Pick any paid plan on the right — your trial starts automatically.
                </p>
              </CardContent>
            </Card>

            {PLAN_META.map((meta) => {
              const product = priceFor(meta.key);
              return (
                <Card key={meta.key} className={`flex flex-col ${meta.highlight ? "border-primary shadow-lg" : ""}`}>
                  <CardHeader>
                    {meta.highlight && <Badge className="w-fit mb-2">Most popular</Badge>}
                    <CardTitle>{meta.name}</CardTitle>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <div className="mb-4">
                      <span className="text-4xl font-bold">
                        {formatPrice(product?.unit_amount ?? null, product?.currency ?? "aud")}
                      </span>
                      <span className="text-muted-foreground"> / {interval === "month" ? "mo" : "yr"}</span>
                    </div>
                    <CardDescription>{meta.tagline}</CardDescription>
                    <ul className="space-y-2 text-sm mb-6 flex-1">
                      {meta.features.map((f) => (
                        <li key={f} className="flex gap-2">
                          <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                          {f}
                        </li>
                      ))}
                    </ul>
                    <Button
                      className="w-full"
                      variant={meta.highlight ? "default" : "outline"}
                      disabled={!product || buying === product?.stripe_price_id}
                      onClick={() => product && handleBuy(product.stripe_price_id)}
                    >
                      {buying === product?.stripe_price_id && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                      Start 7-day free trial
                    </Button>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </main>

      <Dialog
        open={emailDialog.open}
        onOpenChange={(open) => setEmailDialog({ open, priceId: open ? emailDialog.priceId : null })}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Enter your email</DialogTitle>
            <DialogDescription>
              We'll use this to set up your account. You can sign in with this email after checkout.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="checkout-email">Email</Label>
            <Input
              id="checkout-email"
              type="email"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter") void submitEmailDialog();
              }}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEmailDialog({ open: false, priceId: null })}>
              Cancel
            </Button>
            <Button onClick={submitEmailDialog}>Continue to checkout</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
