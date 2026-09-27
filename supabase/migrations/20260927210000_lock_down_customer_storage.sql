-- Replace wide-open storage policies with authenticated, workspace-scoped
-- access. First path segment is the owning project / review / workspace id.
-- No policy on customer buckets is granted to PUBLIC or anon.

do $$
declare
  pol record;
begin
  for pol in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and (
        policyname ilike '%review_artifact%'
        or policyname ilike '%review-artifact%'
        or policyname ilike '%project_reference%'
        or policyname ilike '%project-reference%'
        or policyname ilike '%artifact_snapshot%'
        or policyname ilike '%artifact-snapshot%'
      )
  loop
    execute format('drop policy if exists %I on storage.objects', pol.policyname);
  end loop;
end $$;

drop policy if exists project_references_rw on storage.objects;
drop policy if exists review_artifacts_rw on storage.objects;
drop policy if exists artifact_snapshots_rw on storage.objects;

create policy project_references_rw on storage.objects
  for all to authenticated
  using (
    bucket_id = 'project-references'
    and (storage.foldername(name))[1] in (
      select p.id::text
      from public.projects p
      where p.workspace_id in (select public.get_my_workspace_ids())
    )
  )
  with check (
    bucket_id = 'project-references'
    and (storage.foldername(name))[1] in (
      select p.id::text
      from public.projects p
      where p.workspace_id in (select public.get_my_workspace_ids())
    )
  );

create policy review_artifacts_rw on storage.objects
  for all to authenticated
  using (
    bucket_id = 'review-artifacts'
    and (storage.foldername(name))[1] in (
      select r.id::text
      from public.reviews r
      join public.projects p on p.id = r.project_id
      where p.workspace_id in (select public.get_my_workspace_ids())
    )
  )
  with check (
    bucket_id = 'review-artifacts'
    and (storage.foldername(name))[1] in (
      select r.id::text
      from public.reviews r
      join public.projects p on p.id = r.project_id
      where p.workspace_id in (select public.get_my_workspace_ids())
    )
  );

create policy artifact_snapshots_rw on storage.objects
  for all to authenticated
  using (
    bucket_id = 'artifact-snapshots'
    and (storage.foldername(name))[1] in (
      select w.id::text
      from public.workspaces w
      where w.id in (select public.get_my_workspace_ids())
    )
  )
  with check (
    bucket_id = 'artifact-snapshots'
    and (storage.foldername(name))[1] in (
      select w.id::text
      from public.workspaces w
      where w.id in (select public.get_my_workspace_ids())
    )
  );

update storage.buckets
set public = false
where id in ('project-references', 'review-artifacts', 'artifact-snapshots');
