-- Plan tier enum
CREATE TYPE public.plan_tier AS ENUM ('basic', 'advanced', 'integrated');

-- Profiles table (one row per auth user)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  plan_type public.plan_tier NOT NULL DEFAULT 'basic',
  plan_updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- Keep updated_at and plan_updated_at in sync
CREATE OR REPLACE FUNCTION public.profiles_set_timestamps()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  IF TG_OP = 'UPDATE' AND NEW.plan_type IS DISTINCT FROM OLD.plan_type THEN
    NEW.plan_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER profiles_set_timestamps_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.profiles_set_timestamps();

-- Auto-create a profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, plan_type)
  VALUES (NEW.id, NEW.email, 'basic')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_profile
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.handle_new_user_profile();

-- Backfill profiles for existing users
INSERT INTO public.profiles (id, email, plan_type)
SELECT u.id, u.email, 'basic'
FROM auth.users u
ON CONFLICT (id) DO NOTHING;

-- Backend feature access helper
CREATE OR REPLACE FUNCTION public.has_feature_access(feature TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  user_plan public.plan_tier;
BEGIN
  SELECT plan_type INTO user_plan FROM public.profiles WHERE id = auth.uid();
  IF user_plan IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN CASE feature
    WHEN 'cleaning'           THEN user_plan IN ('basic','advanced','integrated')
    WHEN 'sundry_basic_edit'  THEN user_plan IN ('basic','advanced','integrated')
    WHEN 'sundry_breakdown'   THEN user_plan IN ('advanced','integrated')
    WHEN 'other_services'     THEN user_plan IN ('advanced','integrated')
    WHEN 'detailed_results'   THEN user_plan IN ('advanced','integrated')
    WHEN 'fixed_price'        THEN user_plan IN ('advanced','integrated')
    WHEN 'security'           THEN user_plan = 'integrated'
    WHEN 'maintenance'        THEN user_plan = 'integrated'
    WHEN 'management'         THEN user_plan = 'integrated'
    WHEN 'daily_board'        THEN user_plan = 'integrated'
    ELSE FALSE
  END;
END;
$$;