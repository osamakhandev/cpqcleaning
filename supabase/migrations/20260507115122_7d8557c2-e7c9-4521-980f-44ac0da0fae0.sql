create or replace function public.is_email_approved(_email text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.approved_users
    where lower(email) = lower(_email)
      and is_active = true
      and (access_expires_at is null or access_expires_at > now())
  )
$$;

grant execute on function public.is_email_approved(text) to anon, authenticated;