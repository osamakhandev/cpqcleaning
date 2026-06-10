-- Add last_login_at column to approved_users
ALTER TABLE public.approved_users
ADD COLUMN IF NOT EXISTS last_login_at timestamp with time zone;

-- Update activate_trial to also refresh last_login_at on every call,
-- while preserving the "set once" behaviour of first_login_at.
CREATE OR REPLACE FUNCTION public.activate_trial(user_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result JSONB;
BEGIN
  -- Only allow users to activate their own trial / record their own login
  IF lower(user_email) != lower(auth.jwt()->>'email') THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  UPDATE public.approved_users
  SET
    first_login_at = COALESCE(first_login_at, now()),
    access_expires_at = COALESCE(access_expires_at, now() + INTERVAL '7 days'),
    last_login_at = now()
  WHERE lower(email) = lower(user_email)
    AND is_active = true
  RETURNING jsonb_build_object(
    'email', email,
    'is_active', is_active,
    'first_login_at', first_login_at,
    'last_login_at', last_login_at,
    'access_expires_at', access_expires_at
  ) INTO result;

  IF result IS NULL THEN
    RETURN jsonb_build_object('error', 'not_approved');
  END IF;

  RETURN result;
END;
$function$;