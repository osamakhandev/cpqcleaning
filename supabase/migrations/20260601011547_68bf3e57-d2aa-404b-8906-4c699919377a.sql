ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS pause_count_in_window integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pause_window_start timestamptz NULL;