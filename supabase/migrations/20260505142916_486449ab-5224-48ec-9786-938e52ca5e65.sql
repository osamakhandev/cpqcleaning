ALTER TABLE public.stripe_products
ADD COLUMN unit_amount INTEGER,
ADD COLUMN currency TEXT DEFAULT 'aud';