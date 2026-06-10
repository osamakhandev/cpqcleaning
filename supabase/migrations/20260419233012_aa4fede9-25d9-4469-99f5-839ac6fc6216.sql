-- 1. Update activate_trial to also enforce expiry in WHERE clause
CREATE OR REPLACE FUNCTION public.activate_trial(user_email text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result JSONB;
BEGIN
  IF lower(user_email) != lower(auth.jwt()->>'email') THEN
    RETURN jsonb_build_object('error', 'unauthorized');
  END IF;

  UPDATE public.approved_users
  SET
    first_login_at  = COALESCE(first_login_at, now()),
    access_expires_at = COALESCE(access_expires_at, now() + INTERVAL '7 days'),
    last_login_at = now()
  WHERE lower(email) = lower(user_email)
    AND is_active = true
    AND (access_expires_at IS NULL OR access_expires_at > now())
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

-- 2. Approval helper used by RLS policies
CREATE OR REPLACE FUNCTION public.is_current_user_approved()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.approved_users au
    WHERE lower(au.email) = lower(auth.jwt()->>'email')
      AND au.is_active = true
      AND (au.access_expires_at IS NULL OR au.access_expires_at > now())
  );
$$;

-- 3. Tighten projects RLS
DROP POLICY IF EXISTS "Users can view their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can insert their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can update their own projects" ON public.projects;
DROP POLICY IF EXISTS "Users can delete their own projects" ON public.projects;

CREATE POLICY "Approved users can view their own projects"
ON public.projects FOR SELECT TO authenticated
USING (owner_id = auth.uid() AND public.is_current_user_approved());

CREATE POLICY "Approved users can insert their own projects"
ON public.projects FOR INSERT TO authenticated
WITH CHECK (owner_id = auth.uid() AND public.is_current_user_approved());

CREATE POLICY "Approved users can update their own projects"
ON public.projects FOR UPDATE TO authenticated
USING (owner_id = auth.uid() AND public.is_current_user_approved())
WITH CHECK (owner_id = auth.uid() AND public.is_current_user_approved());

CREATE POLICY "Approved users can delete their own projects"
ON public.projects FOR DELETE TO authenticated
USING (owner_id = auth.uid() AND public.is_current_user_approved());

-- 4. Tighten approved_users self-view
DROP POLICY IF EXISTS "Users can view own approved record" ON public.approved_users;

CREATE POLICY "Approved active users can view own record"
ON public.approved_users FOR SELECT TO authenticated
USING (
  lower(email) = lower(auth.jwt()->>'email')
  AND is_active = true
  AND (access_expires_at IS NULL OR access_expires_at > now())
);

-- 5. Ensure signup-blocking trigger exists on auth.users
DROP TRIGGER IF EXISTS enforce_approved_signup_trigger ON auth.users;
CREATE TRIGGER enforce_approved_signup_trigger
  BEFORE INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_approved_signup();