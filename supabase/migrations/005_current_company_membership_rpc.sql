-- Return the current authenticated user's TQR company membership.
-- This keeps admin bootstrapping stable even when direct table RLS is strict.

create or replace function public.current_company_membership()
returns table (
  company_id uuid,
  company_code text,
  company_name text,
  display_name text,
  role public.tqr_user_role
)
language sql
stable
security definer
set search_path = public
as $$
  select
    c.id as company_id,
    c.company_code,
    c.name as company_name,
    cu.display_name,
    cu.role
  from public.company_users cu
  join public.companies c on c.id = cu.company_id
  where cu.auth_user_id = auth.uid()
  order by cu.created_at
  limit 1;
$$;

revoke all on function public.current_company_membership() from public, anon, authenticated;
grant execute on function public.current_company_membership() to authenticated;
