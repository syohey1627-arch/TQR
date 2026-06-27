-- Add demo employees E-0008 through E-0015 for TOTAL-001.
-- All demo employees use PASS 1234. Change before any external use.

do $$
declare
  v_company_id uuid;
  v_site_id uuid;
  v_employee record;
begin
  select id
  into v_company_id
  from public.companies
  where company_code = 'TOTAL-001';

  if v_company_id is null then
    raise exception 'Company TOTAL-001 does not exist.';
  end if;

  select id
  into v_site_id
  from public.sites
  where company_id = v_company_id
  order by created_at
  limit 1;

  if v_site_id is null then
    raise exception 'No site exists for company TOTAL-001.';
  end if;

  for v_employee in
    select *
    from (values
      ('E-0008', 'テスト 太郎'),
      ('E-0009', 'テスト 花子'),
      ('E-0010', '佐藤 花子'),
      ('E-0011', '鈴木 一郎'),
      ('E-0012', '田中 美咲'),
      ('E-0013', '高橋 健太'),
      ('E-0014', '伊藤 直子'),
      ('E-0015', '渡辺 翔')
    ) as employees(employee_code, display_name)
  loop
    insert into public.employees (
      company_id,
      site_id,
      employee_code,
      display_name,
      pass_hash,
      pass_punch_enabled,
      is_active
    )
    values (
      v_company_id,
      v_site_id,
      v_employee.employee_code,
      v_employee.display_name,
      crypt('1234', gen_salt('bf')),
      true,
      true
    )
    on conflict (company_id, employee_code) do update
      set site_id = excluded.site_id,
          display_name = excluded.display_name,
          pass_hash = excluded.pass_hash,
          pass_punch_enabled = excluded.pass_punch_enabled,
          is_active = excluded.is_active;
  end loop;
end $$;
