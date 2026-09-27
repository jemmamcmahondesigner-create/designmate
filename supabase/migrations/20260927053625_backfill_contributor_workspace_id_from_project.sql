-- Two project-scoped contributors ("Eamonn Reviewer", "Amber Reviewer") have
-- workspace_id NULL while their project sits in a real workspace. They are live:
-- each is assigned as a reviewer on live in-review reviews and has feedback rows.
--
-- Two consequences of leaving them NULL:
--   1. The contributors SELECT policy has a `workspace_id IS NULL OR <member>`
--      branch, so their names and email addresses were readable by every signed-in
--      user in every workspace.
--   2. The new contributors_update_workspace policy requires
--      workspace_id IN get_my_workspace_ids(); NULL never satisfies that, so these
--      rows had become unwritable by anyone, including their own workspace's admin.
--
-- Backfill from the project they already belong to. Derived, not hardcoded.
update public.contributors c
set workspace_id = p.workspace_id
from public.projects p
where p.id = c.project_id
  and c.workspace_id is null;
