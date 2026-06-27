-- Allow company admins to add/update employees from the admin screen.
-- PASS is only replaced when a new value is supplied.

create or replace function public.admin_upsert_employee(
  p_employee_code text,
  p_employee_name text,
  p_department_name text default '未設定',
  p_employee_pass text default null,
  p_pass_punch_enabled boolean default true,
  p_is_active boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_company_id uuid;
  v_site_id uuid;
  v_employee_id uuid;
  v_employee_code text := upper(nullif(trim(coalesce(p_employee_code, '')), ''));
  v_employee_name text := nullif(trim(coalesce(p_employee_name, '')), '');
  v_department_name text := coalesce(nullif(trim(coalesce(p_department_name, '')), ''), '未設定');
  v_employee_pass text := nullif(p_employee_pass, '');
  v_pass_hash text := null;
begin
  if v_user_id is null then
    raise exception 'Not authenticated.';
  end if;

  if v_employee_code is null then
    raise exception 'Employee code is required.';
  end if;

  if v_employee_name is null then
    raise exception 'Employee name is required.';
  end if;

  if v_employee_code !~ '^[A-Z0-9][A-Z0-9_-]{1,31}$' then
    raise exception 'Employee code format is invalid.';
  end if;

  select cu.company_id
  into v_company_id
  from public.company_users cu
  where cu.auth_user_id = v_user_id
    and cu.role in ('owner', 'admin')
  order by cu.created_at
  limit 1;

  if v_company_id is null then
    raise exception 'Admin company membership was not found.';
  end if;

  select s.id
  into v_site_id
  from public.sites s
  where s.company_id = v_company_id
  order by s.created_at
  limit 1;

  if v_employee_pass is not null then
    v_pass_hash := crypt(v_employee_pass, gen_salt('bf'));
  end if;

  insert into public.employees (
    company_id,
    site_id,
    employee_code,
    display_name,
    department_name,
    pass_hash,
    pass_punch_enabled,
    is_active
  )
  values (
    v_company_id,
    v_site_id,
    v_employee_code,
    v_employee_name,
    v_department_name,
    v_pass_hash,
    coalesce(p_pass_punch_enabled, true),
    coalesce(p_is_active, true)
  )
  on conflict (company_id, employee_code) do update
    set display_name = excluded.display_name,
        department_name = excluded.department_name,
        pass_hash = coalesce(excluded.pass_hash, public.employees.pass_hash),
        pass_punch_enabled = excluded.pass_punch_enabled,
        is_active = excluded.is_active
  returning id into v_employee_id;

  insert into public.audit_logs (
    company_id,
    actor_user_id,
    action,
    target_table,
    target_id,
    details
  )
  values (
    v_company_id,
    v_user_id,
    'admin_upsert_employee',
    'employees',
    v_employee_id,
    jsonb_build_object(
      'employee_code', v_employee_code,
      'employee_name', v_employee_name,
      'department_name', v_department_name,
      'pass_punch_enabled', coalesce(p_pass_punch_enabled, true),
      'is_active', coalesce(p_is_active, true),
      'pass_changed', v_employee_pass is not null
    )
  );

  return jsonb_build_object(
    'ok', true,
    'employeeId', v_employee_id,
    'employeeCode', v_employee_code,
    'employeeName', v_employee_name,
    'departmentName', v_department_name
  );
end;
$$;

revoke all on function public.admin_upsert_employee(text, text, text, text, boolean, boolean)
from public, anon, authenticated;
grant execute on function public.admin_upsert_employee(text, text, text, text, boolean, boolean)
to authenticated;
