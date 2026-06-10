CREATE OR REPLACE FUNCTION public.has_feature_access(feature text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  user_plan public.plan_tier;
BEGIN
  SELECT plan_type INTO user_plan FROM public.profiles WHERE id = auth.uid();
  IF user_plan IS NULL THEN
    RETURN FALSE;
  END IF;

  RETURN CASE feature
    WHEN 'cleaning'            THEN user_plan IN ('basic','advanced','integrated')
    WHEN 'post_30_june_start'  THEN user_plan IN ('basic','advanced','integrated')
    WHEN 'sundry_basic_edit'   THEN user_plan IN ('basic','advanced','integrated')
    WHEN 'sundry_breakdown'    THEN user_plan IN ('advanced','integrated')
    WHEN 'other_services'      THEN user_plan IN ('advanced','integrated')
    WHEN 'detailed_results'    THEN user_plan IN ('advanced','integrated')
    WHEN 'fixed_price'         THEN user_plan IN ('advanced','integrated')
    WHEN 'security'            THEN user_plan = 'integrated'
    WHEN 'maintenance'         THEN user_plan = 'integrated'
    WHEN 'management'          THEN user_plan = 'integrated'
    WHEN 'daily_board'         THEN user_plan = 'integrated'
    ELSE FALSE
  END;
END;
$function$;