alter table public.change_requests
  alter column artifact_ids type text[]
  using artifact_ids::text[];
