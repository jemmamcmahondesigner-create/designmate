-- rotate_workspace_invite_codes_high_entropy
-- Already applied on the remote database on 2026-10-12.
-- Checked in so local and remote migration history agree. Do not re-run on production.

UPDATE public.workspaces
SET invite_code =
  COALESCE(
    NULLIF(
      left(
        trim(both '-' from regexp_replace(lower(trim(name)), '[^a-z0-9]+', '-', 'g')),
        20
      ),
      ''
    ),
    'workspace'
  )
  || '-' || encode(gen_random_bytes(12), 'hex');
