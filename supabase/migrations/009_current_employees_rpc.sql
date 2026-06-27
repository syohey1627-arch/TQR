-- Return employees for the current authenticated user's company.

create or replace function public.current_employees()
returns table (
  employee_id uuid,
  employee_code text,
  employee_name text,
  pass_punch_enabled boolean,
  is_active boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  with membership as (
    select cu.company_id
    from public.company_users cu
    where cu.auth_user_id = auth.uid()
    order by cu.created_at
    limit 1
  )
  select
    e.id as employee_id,
    e.employee_code,
    e.display_name as employee_name,
    e.pass_punch_enabled,
    e.is_active,
    e.created_at
  from public.employees e
  join membership m on m.company_id = e.company_id
  order by e.employee_code;
$$;

revoke all on function public.current_employees() from public, anon, authenticated;
grant execute on function public.current_employees() to authenticated;
