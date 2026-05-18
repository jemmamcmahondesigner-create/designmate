-- Ensure the contributor_roles table is readable by the anon key the browser uses.
-- Mirrors the permissive RLS pattern already in place for projects / contributors.

alter table public.contributor_roles enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'contributor_roles'
      and policyname = 'Allow all for now'
  ) then
    create policy "Allow all for now"
      on public.contributor_roles
      for all
      using (true)
      with check (true);
  end if;
end
$$;

-- Backfill the four default roles if any are missing on the hosted DB.
insert into public.contributor_roles (name)
values ('Designer'), ('Engineer'), ('Product Manager'), ('Stakeholder')
on conflict (name) do nothing;
