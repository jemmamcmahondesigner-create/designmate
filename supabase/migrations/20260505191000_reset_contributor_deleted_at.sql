-- One-time correction for teammate visibility in settings table.
-- Existing contributors should remain active unless explicitly removed.

update public.contributors
set deleted_at = null
where deleted_at is not null;
