-- Restores a uniqueness target for reviewer_feedback upserts after
-- 20260429000000_reviewer_feedback_multi.sql dropped reviewer_feedback_review_id_reviewer_id_key.
-- PostgREST upsert onConflict: "review_id,reviewer_id" requires a unique or exclusion constraint.

-- Without the old unique constraint, duplicates may exist; keep one row per pair.
delete from public.reviewer_feedback a
using public.reviewer_feedback b
where a.review_id = b.review_id
  and a.reviewer_id = b.reviewer_id
  and a.id > b.id;

create unique index if not exists reviewer_feedback_review_reviewer_unique
  on public.reviewer_feedback (review_id, reviewer_id);
