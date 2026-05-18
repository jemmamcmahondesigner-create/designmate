-- Decision + per-reviewer feedback data model for Review Detail.
--
-- Adds the decision summary columns on `reviews` (backing the DS DecisionCard)
-- plus a new `reviewer_feedback` table with one row per (review, reviewer)
-- pair (backing the per-reviewer DS CommentThread list on the Review Detail
-- page's Feedback column).
--
-- The codebase currently uses `public.contributors` as its user entity (see
-- 20260413000000_project_detail_tables.sql) and the repo's RLS posture is
-- "Allow all for now" (see 20260414100000_reviews.sql). This migration keeps
-- both conventions so existing read/write paths keep working.

-- ── Decision columns on reviews ──────────────────────────────────────────────

alter table public.reviews
  add column if not exists decision_text      text,
  add column if not exists decision_status    text default 'in-review'
    check (
      decision_status in ('in-review', 'approved', 'needs-changes', 'blocked', 'draft')
    ),
  add column if not exists decision_made_at   timestamptz,
  add column if not exists decision_owner_id  uuid
    references public.contributors(id) on delete set null,
  add column if not exists decision_options   text[] not null default '{}',
  add column if not exists trade_off_note     text,
  add column if not exists trade_off_is_ai    boolean not null default true;

-- ── Per-reviewer feedback ────────────────────────────────────────────────────

create table if not exists public.reviewer_feedback (
  id                    uuid primary key default gen_random_uuid(),
  review_id             uuid not null references public.reviews(id) on delete cascade,
  reviewer_id           uuid not null references public.contributors(id) on delete cascade,
  feedback_status       text not null default 'pending'
    check (
      feedback_status in ('pending', 'submitted', 'decision_required')
    ),
  feedback_text         text,
  selected_option       text,
  feedback_submitted_at timestamptz,
  reply_text            text,
  reply_by_id           uuid references public.contributors(id) on delete set null,
  reply_at              timestamptz,
  created_at            timestamptz not null default now(),
  unique (review_id, reviewer_id)
);

create index if not exists reviewer_feedback_review_id_idx
  on public.reviewer_feedback (review_id);

alter table public.reviewer_feedback enable row level security;

drop policy if exists "Allow all for now" on public.reviewer_feedback;
create policy "Allow all for now"
  on public.reviewer_feedback
  for all
  using (true)
  with check (true);
