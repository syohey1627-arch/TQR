-- Add leave-out/return totals to the current attendance summary RPC.
-- Work minutes are clock-out - clock-in - break - leave.

drop function if exists public.current_attendance_rows(date);

create or replace function public.current_attendance_rows(p_target_date date)
returns table (
  employee_id uuid,
  employee_code text,
  employee_name text,
  clock_in_at timestamptz,
  clock_out_at timestamptz,
  break_minutes integer,
  leave_minutes integer,
  work_minutes integer,
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
  ),
  break_pairs as (
    select
      starts.employee_id,
      starts.punched_at as start_at,
      (
        select min(ends.punched_at)
        from day_punches ends
        where ends.employee_id = starts.employee_id
          and ends.status = 'valid'
          and ends.punch_type = 'break_end'
          and ends.punched_at > starts.punched_at
      ) as end_at
    from day_punches starts
    where starts.status = 'valid'
      and starts.punch_type = 'break_start'
  ),
  leave_pairs as (
    select
      starts.employee_id,
      starts.punched_at as start_at,
      (
        select min(ends.punched_at)
        from day_punches ends
        where ends.employee_id = starts.employee_id
          and ends.status = 'valid'
          and ends.punch_type = 'leave_end'
          and ends.punched_at > starts.punched_at
      ) as end_at
    from day_punches starts
    where starts.status = 'valid'
      and starts.punch_type = 'leave_start'
  ),
  break_totals as (
    select
      employee_id,
      coalesce(floor(sum(extract(epoch from (end_at - start_at))) / 60)::integer, 0) as minutes
    from break_pairs
    where end_at is not null
    group by employee_id
  ),
  leave_totals as (
    select
      employee_id,
      coalesce(floor(sum(extract(epoch from (end_at - start_at))) / 60)::integer, 0) as minutes
    from leave_pairs
    where end_at is not null
    group by employee_id
  ),
  employee_summary as (
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
  )
  select
    es.employee_id,
    es.employee_code,
    es.employee_name,
    es.clock_in_at,
    es.clock_out_at,
    coalesce(bt.minutes, 0) as break_minutes,
    coalesce(lt.minutes, 0) as leave_minutes,
    case
      when es.clock_in_at is not null and es.clock_out_at is not null then
        greatest(
          floor(extract(epoch from (es.clock_out_at - es.clock_in_at)) / 60)::integer
            - coalesce(bt.minutes, 0)
            - coalesce(lt.minutes, 0),
          0
        )
      else null
    end as work_minutes,
    es.latest_auth_method,
    es.has_invalid_punch
  from employee_summary es
  left join break_totals bt on bt.employee_id = es.employee_id
  left join leave_totals lt on lt.employee_id = es.employee_id
  order by es.employee_code;
$$;

revoke all on function public.current_attendance_rows(date) from public, anon, authenticated;
grant execute on function public.current_attendance_rows(date) to authenticated;
