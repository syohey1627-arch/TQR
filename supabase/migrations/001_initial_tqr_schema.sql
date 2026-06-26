-- TQR initial Supabase schema
-- Run in Supabase SQL Editor after creating a project.

create extension if not exists pgcrypto;

do $$
begin
  create type public.tqr_user_role as enum ('owner', 'admin', 'viewer');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.tqr_device_status as enum ('active', 'disabled', 'lost');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.tqr_punch_type as enum (
    'clock_in',
    'clock_out',
    'break_start',
    'break_end',
    'leave_start',
    'leave_end'
  );
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.tqr_auth_method as enum ('qr', 'pass', 'manual');
exception
  when duplicate_object then null;
end $$;

do $$
begin
  create type public.tqr_punch_status as enum ('valid', 'blocked_duplicate', 'manual_corrected', 'voided');
exception
  when duplicate_object then null;
end $$;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(),
  company_code text not null unique,
  name text not null,
  pass_punch_enabled boolean not null default true,
  timezone text not null default 'Asia/Tokyo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint companies_company_code_format check (company_code ~ '^[A-Z0-9][A-Z0-9_-]{2,31}$')
);

create table if not exists public.company_users (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  role public.tqr_user_role not null default 'admin',
  display_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, auth_user_id)
);

create table if not exists public.sites (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  pass_punch_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, name)
);

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  employee_code text not null,
  display_name text not null,
  pass_hash text,
  is_active boolean not null default true,
  pass_punch_enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, employee_code)
);

create table if not exists public.employee_qr_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  employee_id uuid not null references public.employees(id) on delete cascade,
  token_hash text not null unique,
  label text,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.devices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  device_code text not null,
  display_name text not null,
  device_secret_hash text,
  status public.tqr_device_status not null default 'active',
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, device_code)
);

create table if not exists public.punch_records (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  site_id uuid references public.sites(id) on delete set null,
  employee_id uuid not null references public.employees(id) on delete restrict,
  device_id uuid references public.devices(id) on delete set null,
  punch_type public.tqr_punch_type not null,
  auth_method public.tqr_auth_method not null,
  status public.tqr_punch_status not null default 'valid',
  punched_at timestamptz not null,
  local_punched_at timestamp,
  client_record_id text,
  duplicate_of uuid references public.punch_records(id) on delete set null,
  note text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, device_id, client_record_id)
);

create table if not exists public.punch_corrections (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  punch_record_id uuid references public.punch_records(id) on delete set null,
  employee_id uuid not null references public.employees(id) on delete restrict,
  before_data jsonb,
  after_data jsonb not null,
  reason text not null,
  corrected_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists public.csv_exports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  exported_by uuid references auth.users(id) on delete set null,
  target_from date not null,
  target_to date not null,
  row_count integer not null default 0,
  file_name text not null,
  created_at timestamptz not null default now(),
  constraint csv_exports_date_range check (target_from <= target_to)
);

create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid references public.companies(id) on delete set null,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_table text,
  target_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_company_users_auth_user_id on public.company_users(auth_user_id);
create index if not exists idx_sites_company_id on public.sites(company_id);
create index if not exists idx_employees_company_id on public.employees(company_id);
create index if not exists idx_employees_site_id on public.employees(site_id);
create index if not exists idx_devices_company_id on public.devices(company_id);
create index if not exists idx_devices_site_id on public.devices(site_id);
create index if not exists idx_qr_tokens_employee_id on public.employee_qr_tokens(employee_id);
create index if not exists idx_punch_records_company_date on public.punch_records(company_id, punched_at desc);
create index if not exists idx_punch_records_employee_date on public.punch_records(employee_id, punched_at desc);
create index if not exists idx_punch_records_device_date on public.punch_records(device_id, punched_at desc);
create index if not exists idx_punch_records_status on public.punch_records(company_id, status);
create index if not exists idx_corrections_company_id on public.punch_corrections(company_id);
create index if not exists idx_csv_exports_company_id on public.csv_exports(company_id);
create index if not exists idx_audit_logs_company_id on public.audit_logs(company_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_companies_updated_at on public.companies;
create trigger set_companies_updated_at
before update on public.companies
for each row execute function public.set_updated_at();

drop trigger if exists set_company_users_updated_at on public.company_users;
create trigger set_company_users_updated_at
before update on public.company_users
for each row execute function public.set_updated_at();

drop trigger if exists set_sites_updated_at on public.sites;
create trigger set_sites_updated_at
before update on public.sites
for each row execute function public.set_updated_at();

drop trigger if exists set_employees_updated_at on public.employees;
create trigger set_employees_updated_at
before update on public.employees
for each row execute function public.set_updated_at();

drop trigger if exists set_devices_updated_at on public.devices;
create trigger set_devices_updated_at
before update on public.devices
for each row execute function public.set_updated_at();

drop trigger if exists set_punch_records_updated_at on public.punch_records;
create trigger set_punch_records_updated_at
before update on public.punch_records
for each row execute function public.set_updated_at();

create or replace function public.user_company_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select company_id
  from public.company_users
  where auth_user_id = auth.uid();
$$;

create or replace function public.is_company_admin(target_company_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.company_users
    where auth_user_id = auth.uid()
      and company_id = target_company_id
      and role in ('owner', 'admin')
  );
$$;

alter table public.companies enable row level security;
alter table public.company_users enable row level security;
alter table public.sites enable row level security;
alter table public.employees enable row level security;
alter table public.employee_qr_tokens enable row level security;
alter table public.devices enable row level security;
alter table public.punch_records enable row level security;
alter table public.punch_corrections enable row level security;
alter table public.csv_exports enable row level security;
alter table public.audit_logs enable row level security;

create policy "company users can view their companies"
on public.companies for select
to authenticated
using (id in (select public.user_company_ids()));

create policy "admins can update their companies"
on public.companies for update
to authenticated
using (public.is_company_admin(id))
with check (public.is_company_admin(id));

create policy "company users can view memberships"
on public.company_users for select
to authenticated
using (company_id in (select public.user_company_ids()));

create policy "owners can manage memberships"
on public.company_users for all
to authenticated
using (
  exists (
    select 1
    from public.company_users cu
    where cu.auth_user_id = auth.uid()
      and cu.company_id = company_users.company_id
      and cu.role = 'owner'
  )
)
with check (
  exists (
    select 1
    from public.company_users cu
    where cu.auth_user_id = auth.uid()
      and cu.company_id = company_users.company_id
      and cu.role = 'owner'
  )
);

create policy "company users can view sites"
on public.sites for select
to authenticated
using (company_id in (select public.user_company_ids()));

create policy "admins can manage sites"
on public.sites for all
to authenticated
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

create policy "company users can view employees"
on public.employees for select
to authenticated
using (company_id in (select public.user_company_ids()));

create policy "admins can manage employees"
on public.employees for all
to authenticated
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

create policy "company users can view qr tokens"
on public.employee_qr_tokens for select
to authenticated
using (company_id in (select public.user_company_ids()));

create policy "admins can manage qr tokens"
on public.employee_qr_tokens for all
to authenticated
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

create policy "company users can view devices"
on public.devices for select
to authenticated
using (company_id in (select public.user_company_ids()));

create policy "admins can manage devices"
on public.devices for all
to authenticated
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

create policy "company users can view punch records"
on public.punch_records for select
to authenticated
using (company_id in (select public.user_company_ids()));

create policy "admins can manage punch records"
on public.punch_records for all
to authenticated
using (public.is_company_admin(company_id))
with check (public.is_company_admin(company_id));

create policy "company users can view corrections"
on public.punch_corrections for select
to authenticated
using (company_id in (select public.user_company_ids()));

create policy "admins can create corrections"
on public.punch_corrections for insert
to authenticated
with check (public.is_company_admin(company_id));

create policy "company users can view csv exports"
on public.csv_exports for select
to authenticated
using (company_id in (select public.user_company_ids()));

create policy "admins can create csv exports"
on public.csv_exports for insert
to authenticated
with check (public.is_company_admin(company_id));

create policy "company users can view audit logs"
on public.audit_logs for select
to authenticated
using (company_id in (select public.user_company_ids()));

create policy "admins can create audit logs"
on public.audit_logs for insert
to authenticated
with check (company_id is null or public.is_company_admin(company_id));
