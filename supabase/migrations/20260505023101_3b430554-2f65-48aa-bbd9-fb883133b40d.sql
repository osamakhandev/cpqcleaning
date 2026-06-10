
-- Enums
DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM ('trialing','active','past_due','canceled','incomplete');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.billing_interval AS ENUM ('month','year');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- stripe_products: maps Stripe price IDs to internal plans
CREATE TABLE IF NOT EXISTS public.stripe_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan public.plan_tier NOT NULL,
  stripe_product_id text NOT NULL,
  stripe_price_id text NOT NULL UNIQUE,
  billing_interval public.billing_interval NOT NULL,
  payment_link_url text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.stripe_products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "stripe_products readable by authenticated"
  ON public.stripe_products FOR SELECT TO authenticated USING (true);

-- subscriptions
CREATE TABLE IF NOT EXISTS public.subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  email text NOT NULL,
  plan public.plan_tier NOT NULL,
  status public.subscription_status NOT NULL,
  trial_start timestamptz,
  trial_end timestamptz,
  current_period_end timestamptz,
  stripe_customer_id text,
  stripe_subscription_id text UNIQUE,
  stripe_price_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_email ON public.subscriptions (lower(email));
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions (user_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_subscriptions_active_email
  ON public.subscriptions (lower(email)) WHERE status <> 'canceled';

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own subscription by id"
  ON public.subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR lower(email) = lower(auth.jwt()->>'email'));

CREATE TRIGGER trg_subscriptions_updated_at
  BEFORE UPDATE ON public.subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- features catalog
CREATE TABLE IF NOT EXISTS public.features (
  key text PRIMARY KEY,
  description text
);
ALTER TABLE public.features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "features readable by authenticated"
  ON public.features FOR SELECT TO authenticated USING (true);

CREATE TABLE IF NOT EXISTS public.plan_features (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  plan public.plan_tier NOT NULL,
  feature_key text NOT NULL REFERENCES public.features(key) ON DELETE CASCADE,
  UNIQUE (plan, feature_key)
);
ALTER TABLE public.plan_features ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plan_features readable by authenticated"
  ON public.plan_features FOR SELECT TO authenticated USING (true);

-- Seed feature catalog
INSERT INTO public.features (key) VALUES
  ('cleaning'),('post_30_june_start'),('fixed_price'),
  ('sundry_basic_edit'),('sundry_breakdown'),
  ('other_services'),('detailed_results'),
  ('security'),('maintenance'),('management'),('daily_board')
ON CONFLICT (key) DO NOTHING;

INSERT INTO public.plan_features (plan, feature_key) VALUES
  ('basic','cleaning'),('advanced','cleaning'),('integrated','cleaning'),
  ('basic','post_30_june_start'),('advanced','post_30_june_start'),('integrated','post_30_june_start'),
  ('advanced','fixed_price'),('integrated','fixed_price'),
  ('basic','sundry_basic_edit'),('advanced','sundry_basic_edit'),('integrated','sundry_basic_edit'),
  ('advanced','sundry_breakdown'),('integrated','sundry_breakdown'),
  ('advanced','other_services'),('integrated','other_services'),
  ('advanced','detailed_results'),('integrated','detailed_results'),
  ('integrated','security'),
  ('integrated','maintenance'),
  ('integrated','management'),
  ('integrated','daily_board')
ON CONFLICT (plan, feature_key) DO NOTHING;

-- Webhook idempotency log
CREATE TABLE IF NOT EXISTS public.stripe_webhook_events (
  event_id text PRIMARY KEY,
  type text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb
);
ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
-- No policies: service-role only

-- Rewrite has_feature_access to consult plan_features + trial
CREATE OR REPLACE FUNCTION public.has_feature_access(feature text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_email text := lower(auth.jwt()->>'email');
  v_plan public.plan_tier;
  v_in_trial boolean := false;
BEGIN
  IF v_uid IS NULL THEN RETURN FALSE; END IF;

  -- Trial short-circuit: any active subscription with trial_end in future grants full access
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE (s.user_id = v_uid OR lower(s.email) = v_email)
      AND s.status = 'trialing'
      AND s.trial_end IS NOT NULL
      AND s.trial_end > now()
  ) INTO v_in_trial;
  IF v_in_trial THEN RETURN TRUE; END IF;

  -- Otherwise check plan_features
  SELECT plan_type INTO v_plan FROM public.profiles WHERE id = v_uid;
  IF v_plan IS NULL THEN RETURN FALSE; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.plan_features pf
    WHERE pf.plan = v_plan AND pf.feature_key = feature
  );
END;
$function$;
