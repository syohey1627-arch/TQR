-- Return attendance rows for the current authenticated user's company.
-- The function checks membership internally and returns only that tenant's data.

create or replace function public.current_attendance_rows(p_target_date date)
returns table (
  employee_id uuid,
  employee_code text,
  employee_name text,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  latest_auth_method public.tqr_auth_method,
  has_invalid_punch boolean
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
  ),
  target_company as (
    select c.id, c.timezone
    from public.companies c
    join membership m on m.company_id = c.id
  ),
  day_range as (
    select
      (p_target_date::timestamp at time zone timezone) as start_at,
      ((p_target_date::timestamp + interval '1 day') at time zone timezone) as end_at
    from target_company
  ),
  day_punches as (
    select p.*
    from public.punch_records p
    cross join day_range d
    where p.company_id = (select id from target_company)
      and p.punched_at >= d.start_at
      and p.punched_at < d.end_at
  )
  select
    e.id as employee_id,
    e.employee_code,
    e.display_name as employee_name,
    min(dp.punched_at) filter (where dp.punch_type = 'clock_in' and dp.status = 'valid') as clock_in_at,
    max(dp.punched_at) filter (where dp.punch_type = 'clock_out' and dp.status = 'valid') as clock_out_at,
    (
      array_agg(dp.auth_method order by dp.punched_at desc)
      filter (where dp.id is not null)
    )[1] as latest_auth_method,
    coalesce(bool_or(dp.status <> 'valid'), false) as has_invalid_punch
  from public.employees e
  left join day_punches dp on dp.employee_id = e.id
  where e.company_id = (select id from target_company)
    and e.is_active
  group by e.id, e.employee_code, e.display_name
  order by e.employee_code;
$$;

revoke all on function public.current_attendance_rows(date) from public, anon, authenticated;
grant execute on function public.current_attendance_rows(date) to authenticated;
