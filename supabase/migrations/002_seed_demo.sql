-- TQR demo tenant seed
--
-- Before running, replace __ADMIN_AUTH_USER_ID__ with the UID shown in
-- Supabase Authentication > Users. This seed is for a fresh development
-- project only; change all demo credentials before any external use.

do $$
declare
  v_admin_user_id uuid := '__ADMIN_AUTH_USER_ID__'::uuid;
  v_company_id uuid;
  v_site_id uuid;
  v_employee_id uuid;
begin
  if not exists (select 1 from auth.users where id = v_admin_user_id) then
    raise exception 'The supplied admin auth user does not exist.';
  end if;

  insert into public.companies (company_code, name, pass_punch_enabled)
  values ('TOTAL-001', 'TQR テスト会社', true)
  on conflict (company_code) do update
    set name = excluded.name,
        pass_punch_enabled = excluded.pass_punch_enabled
  returning id into v_company_id;

  insert into public.company_users (company_id, auth_user_id, role, display_name)
  values (v_company_id, v_admin_user_id, 'owner', 'TQR 管理者')
  on conflict (company_id, auth_user_id) do update
    set role = 'owner',
        display_name = excluded.display_name;

  insert into public.sites (company_id, name, pass_punch_enabled)
  values (v_company_id, '本社', true)
  on conflict (company_id, name) do update
    set pass_punch_enabled = excluded.pass_punch_enabled
  returning id into v_site_id;

  insert into public.employees (
    company_id,
    site_id,
    employee_code,
    display_name,
    pass_hash,
    pass_punch_enabled
  )
  values (
    v_company_id,
    v_site_id,
    'E-0007',
    '山田 太郎',
    crypt('1234', gen_salt('bf')),
    true
  )
  on conflict (company_id, employee_code) do update
    set site_id = excluded.site_id,
        display_name = excluded.display_name,
        pass_hash = excluded.pass_hash,
        pass_punch_enabled = excluded.pass_punch_enabled
  returning id into v_employee_id;

  insert into public.devices (
    company_id,
    site_id,
    device_code,
    display_name,
    device_secret_hash,
    status
  )
  values (
    v_company_id,
    v_site_id,
    'TQR-TAB-001',
    'TQR テスト端末',
    crypt('0000', gen_salt('bf')),
    'active'
  )
  on conflict (company_id, device_code) do update
    set site_id = excluded.site_id,
        display_name = excluded.display_name,
        device_secret_hash = excluded.device_secret_hash,
        status = excluded.status;

  delete from public.employee_qr_tokens
  where employee_id = v_employee_id;

  insert into public.employee_qr_tokens (company_id, employee_id, token_hash, label)
  values (
    v_company_id,
    v_employee_id,
    crypt('tqr-demo-qr-token-change-before-production', gen_salt('bf')),
    'デモQRトークン'
  );

  insert into public.audit_logs (company_id, actor_user_id, action, target_table, details)
  values (
    v_company_id,
    v_admin_user_id,
    'demo_seeded',
    'companies',
    jsonb_build_object('employee_code', 'E-0007', 'device_code', 'TQR-TAB-001')
  );
end $$;
