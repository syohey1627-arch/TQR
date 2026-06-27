-- Save manual clock-in/clock-out corrections from the admin screen.
-- Existing valid clock-in/out records for the day are marked manual_corrected,
-- and replacement manual records are inserted.

create or replace function public.admin_save_attendance_correction(
  p_target_date date,
  p_employee_code text,
  p_clock_in time default null,
  p_clock_out time default null,
  p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_company public.companies%rowtype;
  v_employee public.employees%rowtype;
  v_day_start timestamptz;
  v_day_end timestamptz;
  v_before jsonb;
  v_after jsonb;
  v_reason text := nullif(trim(coalesce(p_reason, '')), '');
begin
  if v_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  if v_reason is null then
    raise exception 'Correction reason is required.';
  end if;

  if p_clock_in is null and p_clock_out is null then
    raise exception 'Clock-in or clock-out is required.';
  end if;

  select c.*
  into v_company
  from public.companies c
  join public.company_users cu on cu.company_id = c.id
  where cu.auth_user_id = v_user_id
    and cu.role in ('owner', 'admin')
  order by cu.created_at
  limit 1;

  if not found then
    raise exception 'Admin company membership was not found.';
  end if;

  select *
  into v_employee
  from public.employees
  where company_id = v_company.id
    and employee_code = trim(p_employee_code)
    and is_active
  limit 1;

  if not found then
    raise exception 'Employee was not found.';
  end if;

  v_day_start := p_target_date::timestamp at time zone v_company.timezone;
  v_day_end := (p_target_date::timestamp + interval '1 day') at time zone v_company.timezone;

  select coalesce(jsonb_agg(to_jsonb(p) order by p.punched_at), '[]'::jsonb)
  into v_before
  from public.punch_records p
  where p.company_id = v_company.id
    and p.employee_id = v_employee.id
    and p.punched_at >= v_day_start
    and p.punched_at < v_day_end
    and p.punch_type in ('clock_in', 'clock_out');

  update public.punch_records
  set status = 'manual_corrected',
      note = coalesce(note || E'\n', '') || 'Manual correction: ' || v_reason
  where company_id = v_company.id
    and employee_id = v_employee.id
    and punched_at >= v_day_start
    and punched_at < v_day_end
    and punch_type in ('clock_in', 'clock_out')
    and status = 'valid';

  if p_clock_in is not null then
    insert into public.punch_records (
      company_id,
      site_id,
      employee_id,
      punch_type,
      auth_method,
      status,
      punched_at,
      local_punched_at,
      note,
      created_by
    )
    values (
      v_company.id,
      v_employee.site_id,
      v_employee.id,
      'clock_in',
      'manual',
      'valid',
      (p_target_date + p_clock_in) at time zone v_company.timezone,
      p_target_date + p_clock_in,
      v_reason,
      v_user_id
    );
  end if;

  if p_clock_out is not null then
    insert into public.punch_records (
      company_id,
      site_id,
      employee_id,
      punch_type,
      auth_method,
      status,
      punched_at,
      local_punched_at,
      note,
      created_by
    )
    values (
      v_company.id,
      v_employee.site_id,
      v_employee.id,
      'clock_out',
      'manual',
      'valid',
      (p_target_date + p_clock_out) at time zone v_company.timezone,
      p_target_date + p_clock_out,
      v_reason,
      v_user_id
    );
  end if;

  v_after := jsonb_build_object(
    'target_date', p_target_date,
    'employee_code', v_employee.employee_code,
    'clock_in', p_clock_in,
    'clock_out', p_clock_out,
    'reason', v_reason
  );

  insert into public.punch_corrections (
    company_id,
    employee_id,
    before_data,
    after_data,
    reason,
    corrected_by
  )
  values (
    v_company.id,
    v_employee.id,
    v_before,
    v_after,
    v_reason,
    v_user_id
  );

  return jsonb_build_object(
    'ok', true,
    'employeeCode', v_employee.employee_code,
    'employeeName', v_employee.display_name
  );
end;
$$;

revoke all on function public.admin_save_attendance_correction(date, text, time, time, text) from public, anon, authenticated;
grant execute on function public.admin_save_attendance_correction(date, text, time, time, text) to authenticated;
