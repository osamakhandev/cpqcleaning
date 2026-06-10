CREATE OR REPLACE FUNCTION public.prevent_profile_plan_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Allow privileged backends (service role / postgres) to change plan_type.
  IF current_user IN ('service_role', 'supabase_admin', 'postgres')
     OR auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.plan_type IS DISTINCT FROM OLD.plan_type THEN
    RAISE EXCEPTION 'plan_type can only be changed by the billing system'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;