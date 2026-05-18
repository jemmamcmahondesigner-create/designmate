-- Align require_decision_maker with review_type (decisions are implicit for
-- compare/approve only; critique/align no longer use a per-review opt-in).

update public.reviews
set require_decision_maker = false
where review_type in ('critique', 'align')
  and require_decision_maker = true;

update public.reviews
set require_decision_maker = true
where review_type in ('compare', 'approve')
  and (require_decision_maker = false or require_decision_maker is null);
