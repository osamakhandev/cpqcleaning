
-- 1) Prevent self-escalation of plan_type on profiles
CREATE OR REPLACE FUNCTION public.prevent_profile_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Allow service_role (webhooks/edge functions with service key) to change plan_type
  IF current_setting('request.jwt.claim.role', true) = 'service_role' THEN
    RETURN NEW;
  END IF;
  IF NEW.plan_type IS DISTINCT FROM OLD.plan_type THEN
    RAISE EXCEPTION 'plan_type can only be changed by the billing system'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_plan_change ON public.profiles;
CREATE TRIGGER trg_prevent_profile_plan_change
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_plan_change();

-- 2) Revoke anon access to is_email_approved to prevent email enumeration
REVOKE EXECUTE ON FUNCTION public.is_email_approved(text) FROM anon, PUBLIC;

-- 3) Explicit deny-all policy on stripe_webhook_events (service role bypasses RLS)
DROP POLICY IF EXISTS "Deny all access to webhook events" ON public.stripe_webhook_events;
CREATE POLICY "Deny all access to webhook events"
ON public.stripe_webhook_events
FOR ALL
TO anon, authenticated
USING (false)
WITH CHECK (false);
