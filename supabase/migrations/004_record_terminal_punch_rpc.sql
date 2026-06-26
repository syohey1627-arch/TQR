-- TQR terminal punch RPC
-- Run after 001_initial_tqr_schema.sql and the demo seed.

create or replace function public.record_terminal_punch(
  p_company_code text,
  p_device_code text,
  p_device_secret text,
  p_punch_type public.tqr_punch_type,
  p_auth_method public.tqr_auth_method,
  p_employee_code text default null,
  p_employee_pass text default null,
  p_qr_token text default null,
  p_client_record_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company public.companies%rowtype;
  v_device public.devices%rowtype;
  v_employee public.employees%rowtype;
  v_duplicate public.punch_records%rowtype;
  v_record public.punch_records%rowtype;
  v_local_day_start timestamp;
  v_local_day_end timestamp;
  v_now timestamptz := now();
begin
  if p_auth_method not in ('qr', 'pass') then
    return jsonb_build_object('ok', false, 'status', 'error', 'message', 'Unsupported auth method.');
  end if;

  select *
  into v_company
  from public.companies
  where company_code = upper(trim(p_company_code));

  if not found then
    return jsonb_build_object('ok', false, 'status', 'error', 'message', 'Company was not found.');
  end if;

  select *
  into v_device
  from public.devices
  where company_id = v_company.id
    and device_code = trim(p_device_code)
    and status = 'active'
    and device_secret_hash is not null
    and crypt(p_device_secret, device_secret_hash) = device_secret_hash;

  if not found then
    return jsonb_build_object('ok', false, 'status', 'error', 'message', 'Device authentication failed.');
  end if;

  update public.devices
  set last_seen_at = v_now
  where id = v_device.id;

  if p_auth_method = 'pass' then
    if not v_company.pass_punch_enabled then
      return jsonb_build_object('ok', false, 'status', 'error', 'message', 'PASS punch is disabled for this company.');
    end if;

    select *
    into v_employee
    from public.employees
    where company_id = v_company.id
      and employee_code = trim(p_employee_code)
      and is_active
      and pass_punch_enabled
      and pass_hash is not null
      and crypt(p_employee_pass, pass_hash) = pass_hash;

    if not found then
      return jsonb_build_object('ok', false, 'status', 'error', 'message', 'Employee PASS authentication failed.');
    end if;
  else
    select e.*
    into v_employee
    from public.employee_qr_tokens q
    join public.employees e on e.id = q.employee_id
    where q.company_id = v_company.id
      and q.revoked_at is null
      and e.is_active
      and crypt(p_qr_token, q.token_hash) = q.token_hash
    order by q.created_at desc
    limit 1;

    if not found then
      return jsonb_build_object('ok', false, 'status', 'error', 'message', 'QR authentication failed.');
    end if;
  end if;

  v_local_day_start := date_trunc('day', timezone(v_company.timezone, v_now));
  v_local_day_end := v_local_day_start + interval '1 day';

  select *
  into v_duplicate
  from public.punch_records
  where company_id = v_company.id
    and employee_id = v_employee.id
    and punch_type = p_punch_type
    and status = 'valid'
    and timezone(v_company.timezone, punched_at) >= v_local_day_start
    and timezone(v_company.timezone, punched_at) < v_local_day_end
  order by punched_at desc
  limit 1;

  if found then
    return jsonb_build_object(
      'ok', false,
      'status', 'duplicate',
      'message', 'This punch was already recorded today.',
      'duplicateOf', v_duplicate.id,
      'employeeCode', v_employee.employee_code,
      'employeeName', v_employee.display_name,
      'punchType', p_punch_type,
      'punchedAt', v_duplicate.punched_at
    );
  end if;

  insert into public.punch_records (
    company_id,
    site_id,
    employee_id,
    device_id,
    punch_type,
    auth_method,
    status,
    punched_at,
    local_punched_at,
    client_record_id
  )
  values (
    v_company.id,
    coalesce(v_employee.site_id, v_device.site_id),
    v_employee.id,
    v_device.id,
    p_punch_type,
    p_auth_method,
    'valid',
    v_now,
    timezone(v_company.timezone, v_now),
    nullif(trim(p_client_record_id), '')
  )
  on conflict (company_id, device_id, client_record_id) do update
    set updated_at = public.punch_records.updated_at
  returning * into v_record;

  return jsonb_build_object(
    'ok', true,
    'status', 'recorded',
    'message', 'Punch recorded.',
    'recordId', v_record.id,
    'employeeCode', v_employee.employee_code,
    'employeeName', v_employee.display_name,
    'punchType', v_record.punch_type,
    'authMethod', v_record.auth_method,
    'punchedAt', v_record.punched_at
  );
end;
$$;

revoke all on function public.record_terminal_punch(
  text,
  text,
  text,
  public.tqr_punch_type,
  public.tqr_auth_method,
  text,
  text,
  text,
  text
) from public, anon, authenticated;

grant execute on function public.record_terminal_punch(
  text,
  text,
  text,
  public.tqr_punch_type,
  public.tqr_auth_method,
  text,
  text,
  text,
  text
) to service_role;
