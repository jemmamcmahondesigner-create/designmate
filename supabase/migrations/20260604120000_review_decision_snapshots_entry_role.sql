-- Split compare final decision into separate decision-log cards (approval vs change request).

alter table public.review_decision_snapshots
  add column if not exists entry_role text not null default 'approval';

alter table public.review_decision_snapshots
  drop constraint if exists review_decision_snapshots_entry_role_check;

alter table public.review_decision_snapshots
  add constraint review_decision_snapshots_entry_role_check
  check (entry_role in ('approval', 'change_request'));
