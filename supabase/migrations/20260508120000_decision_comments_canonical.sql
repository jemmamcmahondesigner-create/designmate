-- Canonical narrative decision body for UI + submitDecisionAction is `decision_comments`.
-- Legacy rows may only have `decision_text` (older migration). Copy across once so reads
-- can prefer `decision_comments` everywhere.

update public.reviews
set decision_comments = decision_text
where coalesce(trim(decision_comments), '') = ''
  and decision_text is not null
  and trim(decision_text) <> '';
