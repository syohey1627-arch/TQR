-- Fix the company_users ownership policy for projects created with 001.
-- A SECURITY DEFINER helper avoids recursively evaluating the table's own RLS policy.

create or replace function public.is_company_owner(target_company_id uuid)
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
      and role = 'owner'
  );
$$;

drop policy if exists "owners can manage memberships" on public.company_users;

create policy "owners can manage memberships"
on public.company_users for all
to authenticated
using (public.is_company_owner(company_id))
with check (public.is_company_owner(company_id));
