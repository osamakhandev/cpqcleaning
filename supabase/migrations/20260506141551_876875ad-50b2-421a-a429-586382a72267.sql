-- 1) Add 'paused' to subscription_status enum
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'paused';

-- 2) Add pause tracking columns
ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS pause_ends_at timestamptz,
  ADD COLUMN IF NOT EXISTS pause_days_used integer NOT NULL DEFAULT 0;

-- 3) Update has_feature_access to block paused/canceled
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
  v_blocked boolean := false;
BEGIN
  IF v_uid IS NULL THEN RETURN FALSE; END IF;

  -- If newest subscription is paused/canceled => no access
  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE (s.user_id = v_uid OR lower(s.email) = v_email)
      AND s.status IN ('paused','canceled')
      AND s.created_at = (
        SELECT max(created_at) FROM public.subscriptions s2
        WHERE (s2.user_id = v_uid OR lower(s2.email) = v_email)
      )
  ) INTO v_blocked;
  IF v_blocked THEN RETURN FALSE; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE (s.user_id = v_uid OR lower(s.email) = v_email)
      AND s.status = 'trialing'
      AND s.trial_end IS NOT NULL
      AND s.trial_end > now()
  ) INTO v_in_trial;
  IF v_in_trial THEN RETURN TRUE; END IF;

  SELECT plan_type INTO v_plan FROM public.profiles WHERE id = v_uid;
  IF v_plan IS NULL THEN RETURN FALSE; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.plan_features pf
    WHERE pf.plan = v_plan AND pf.feature_key = feature
  );
END;
$function$;