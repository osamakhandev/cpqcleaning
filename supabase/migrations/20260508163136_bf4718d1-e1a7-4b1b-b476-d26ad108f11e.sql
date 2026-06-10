ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS scheduled_plan plan_tier NULL,
  ADD COLUMN IF NOT EXISTS scheduled_price_id text NULL,
  ADD COLUMN IF NOT EXISTS scheduled_change_at timestamptz NULL,
  ADD COLUMN IF NOT EXISTS stripe_schedule_id text NULL;