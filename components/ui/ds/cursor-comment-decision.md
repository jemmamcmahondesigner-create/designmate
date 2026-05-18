# CommentThread + DecisionCard — DS Install + Feedback Column Wiring

Two new DS components. Install them, then wire into the Review Detail page.
Run `npx tsc --noEmit` after each section.

---

## SECTION 1 — Copy DS files

Copy into `components/ui/ds/`:
- `CommentThread.tsx` + `CommentThread.module.css`
- `DecisionCard.tsx` + `DecisionCard.module.css`

---

## SECTION 2 — Update barrel export

In `components/ui/ds/index.ts` add:

```ts
export { CommentThread } from './CommentThread';
export type {
  CommentThreadProps,
  CommentThreadType,
  CommentReply,
  CommentOption,
} from './CommentThread';

export { DecisionCard } from './DecisionCard';
export type {
  DecisionCardProps,
  DecisionStatus,
  DecisionOption,
} from './DecisionCard';
```

---

## SECTION 3 — Rename "Stakeholder Feedback" → "Feedback"

Find every file that uses the string "Stakeholder Feedback" or
"StakeholderFeedback" (component name, section heading, column label,
data-testid, type name). Rename all occurrences:
- Component name: `StakeholderFeedbackSection` → `FeedbackSection`
- File: `StakeholderFeedbackSection.tsx` → `FeedbackSection.tsx`
- Heading text: `"Stakeholder Feedback"` → `"Feedback"`
- Column label on Review Detail page: update accordingly

---

## SECTION 4 — Wire CommentThread into FeedbackSection

The Feedback column on the Review Detail page shows one `CommentThread`
card per reviewer. Replace any existing placeholder or local implementation
with the DS component.

**Data model mapping:**

Each reviewer on a review has:
- `reviewer.id`, `reviewer.name`, `reviewer.avatar_url`
- `reviewer.feedback_status`: `'pending' | 'submitted' | 'decision_required'`
- `reviewer.feedback_text` (body)
- `reviewer.selected_option` (which artifact option they chose)
- `reviewer.reply_text` + `reviewer.reply_by` + `reviewer.reply_at`

Map to CommentThread type:

```ts
function getCommentType(reviewer: Reviewer, isDecisionMade: boolean): CommentThreadType {
  if (isDecisionMade) return 'decision'; // after decision is made
  if (reviewer.feedback_status === 'pending') return 'no-feedback';
  if (reviewer.feedback_status === 'decision_required') return 'decision-required';
  if (reviewer.reply_text) return 'with-reply';
  return 'feedback';
}
```

**Render:**

```tsx
import { CommentThread } from '@/components/ui/ds';

{reviewers.map(reviewer => {
  const type = getCommentType(reviewer, isDecisionMade);
  const isCurrentUser = reviewer.id === currentUser.id;

  return (
    <CommentThread
      key={reviewer.id}
      type={type}
      isStakeholder={isCurrentUser}
      authorName={reviewer.name}
      authorAvatarSrc={reviewer.avatar_url ?? undefined}
      timestamp={
        reviewer.feedback_submitted_at
          ? formatDistanceToNow(new Date(reviewer.feedback_submitted_at), { addSuffix: true })
          : undefined
      }
      body={reviewer.feedback_text ?? undefined}
      options={
        reviewer.selected_option
          ? [{ label: reviewer.selected_option }]
          : []
      }
      reply={
        reviewer.reply_text
          ? {
              body: reviewer.reply_text,
              authorName: reviewer.reply_by_name ?? '',
              authorAvatarSrc: reviewer.reply_by_avatar ?? undefined,
              timestamp: reviewer.reply_at
                ? formatDistanceToNow(new Date(reviewer.reply_at), { addSuffix: true })
                : '',
            }
          : undefined
      }
      onReply={async (text) => {
        await submitReply({ reviewId, reviewerId: reviewer.id, text });
      }}
      onMakeDecision={() => {
        // Navigate to or open the decision-making modal/flow
        openDecisionFlow();
      }}
    />
  );
})}
```

---

## SECTION 5 — Wire DecisionCard below the feedback list

After all feedback has been collected and a decision is made, the
`DecisionCard` appears at the bottom of the Feedback column (or replaces
the "Make Decision" flow).

**Find:** Where the review's decision is stored. The `reviews` table
likely has: `decision_text`, `decision_owner_id`, `decision_made_at`,
`decision_status`, `trade_off_note`.

```tsx
import { DecisionCard } from '@/components/ui/ds';

{review.decision_text && (
  <DecisionCard
    status={review.decision_status as DecisionStatus ?? 'approved'}
    options={review.decision_options?.map(o => ({ label: o })) ?? []}
    decisionText={review.decision_text}
    ownerName={decisionOwner?.name ?? 'Unknown'}
    ownerAvatarSrc={decisionOwner?.avatar_url ?? undefined}
    dateLabel={
      review.decision_made_at
        ? formatDistanceToNow(new Date(review.decision_made_at), { addSuffix: true })
        : undefined
    }
    showTradeOff={!!review.trade_off_note}
    tradeOffNote={review.trade_off_note ?? undefined}
    tradeOffIsAI={review.trade_off_is_ai ?? true}
    onKebab={() => setDecisionMenuOpen(true)}
  />
)}
```

---

## SECTION 6 — Supabase: add missing columns if needed

If the `reviews` table doesn't have decision columns yet, run this migration:

```sql
alter table public.reviews
  add column if not exists decision_text       text,
  add column if not exists decision_status     text default 'in-review',
  add column if not exists decision_made_at    timestamptz,
  add column if not exists decision_owner_id   uuid references public.profiles(id),
  add column if not exists decision_options    text[],
  add column if not exists trade_off_note      text,
  add column if not exists trade_off_is_ai     boolean default true;
```

If `reviewer_feedback` is not yet a table, add feedback tracking:

```sql
create table if not exists public.reviewer_feedback (
  id                    uuid primary key default gen_random_uuid(),
  review_id             uuid not null references public.reviews(id) on delete cascade,
  reviewer_id           uuid not null references public.profiles(id),
  feedback_status       text not null default 'pending',
  feedback_text         text,
  selected_option       text,
  feedback_submitted_at timestamptz,
  reply_text            text,
  reply_by_id           uuid references public.profiles(id),
  reply_at              timestamptz,
  created_at            timestamptz default now(),
  unique(review_id, reviewer_id)
);

alter table public.reviewer_feedback enable row level security;
create policy "Users can manage feedback on their reviews"
  on public.reviewer_feedback for all
  using (
    exists (
      select 1 from public.reviews r
      where r.id = review_id
      and (r.owner_id = auth.uid() or reviewer_id = auth.uid())
    )
  );
```

---

## SECTION 7 — Workflow stages (from Figma annotation)

The Feedback column has 4 stages — implement the heading accordingly:

| Stage | When | Heading | Buttons |
|-------|------|---------|---------|
| 1 | No reviewers assigned | "Feedback" | Close drawer |
| 2 | Reviewers assigned, awaiting feedback | "Feedback" + badge | Reminder + Add + Close |
| 3 | All feedback submitted | "Feedback" + badge | Reminder + Add + Close |
| 4 | Decision made | "Feedback" + badge | (disabled reminder + add) + Close |

```tsx
// Stage derivation
const stage =
  reviewers.length === 0 ? 1 :
  allFeedbackSubmitted && !decisionMade ? 3 :
  decisionMade ? 4 : 2;
```

Stage 2 shows a full-width "Submit Feedback" primary button above the
feedback list when the current user hasn't yet submitted.

Stage 3 shows the "Decision Required" CommentThread for the decision-maker.

---

## SECTION 8 — After changes

1. `npx tsc --noEmit` — must pass
2. Pause OneDrive, `rd /s /q .next`, restart dev
3. Check:
   - "Stakeholder Feedback" → "Feedback" everywhere
   - Reviewer with no feedback → `no-feedback` variant (white, "Feedback required" warning)
   - Reviewer with feedback → `feedback` variant (white, body + option tag + reply input)
   - Reviewer with reply → `with-reply` variant (includes nested reply block)
   - Decision-maker → `decision-required` variant (yellow, "Make Decision" button)
   - After decision → `DecisionCard` appears at bottom with status pill + trade-off
