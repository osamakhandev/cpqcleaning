-- 1. Wipe existing shared data (per user request)
DELETE FROM public.projects;

-- 2. Add owner_id column
ALTER TABLE public.projects
  ADD COLUMN owner_id uuid;

-- 3. Now enforce NOT NULL going forward
ALTER TABLE public.projects
  ALTER COLUMN owner_id SET NOT NULL;

-- 4. Index for fast per-user queries
CREATE INDEX idx_projects_owner_id ON public.projects(owner_id);

-- 5. Drop old permissive policies
DROP POLICY IF EXISTS "Anyone can delete projects" ON public.projects;
DROP POLICY IF EXISTS "Anyone can insert projects" ON public.projects;
DROP POLICY IF EXISTS "Anyone can read projects" ON public.projects;
DROP POLICY IF EXISTS "Anyone can update projects" ON public.projects;

-- 6. Owner-scoped RLS policies
CREATE POLICY "Users can view their own projects"
  ON public.projects FOR SELECT
  TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "Users can insert their own projects"
  ON public.projects FOR INSERT
  TO authenticated
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update their own projects"
  ON public.projects FOR UPDATE
  TO authenticated
  USING (owner_id = auth.uid())
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can delete their own projects"
  ON public.projects FOR DELETE
  TO authenticated
  USING (owner_id = auth.uid());