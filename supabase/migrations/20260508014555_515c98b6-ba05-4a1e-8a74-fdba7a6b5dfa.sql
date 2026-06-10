DROP POLICY IF EXISTS "stripe_products readable by authenticated" ON public.stripe_products;
CREATE POLICY "stripe_products readable by anyone"
  ON public.stripe_products FOR SELECT
  TO anon, authenticated USING (true);