-- Function that blocks signup if email is not in approved_users (active)
CREATE OR REPLACE FUNCTION public.enforce_approved_signup()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.approved_users
    WHERE lower(email) = lower(NEW.email)
      AND is_active = true
  ) THEN
    RAISE EXCEPTION 'Access is restricted. Please contact the administrator.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_approved_signup_trigger ON auth.users;
CREATE TRIGGER enforce_approved_signup_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_approved_signup();