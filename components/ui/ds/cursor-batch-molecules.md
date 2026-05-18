# Molecule Components Batch — ReviewCard, DecisionCard, TradeOffBlock, CommentThread

Four new components added to `components/ui/ds/`. Install and wire up.
Run `npx tsc --noEmit` after completing all sections.

---

## SECTION 1 — Barrel export

Add to `components/ui/ds/index.ts`:

```ts
export { ReviewCard } from './ReviewCard';
export type { ReviewCardProps, ReviewStatus, ReviewCardTag } from './ReviewCard';

export { DecisionCard } from './DecisionCard';
export type { DecisionCardProps, DecisionStatus, DecisionOption } from './DecisionCard';

export { TradeOffBlock } from './TradeOffBlock';
export type { TradeOffBlockProps, TradeOffOption, TradeOffSentiment } from './TradeOffBlock';

export { CommentThread } from './CommentThread';
export type { CommentThreadProps, CommentType, CommentReply } from './CommentThread';
```

---

## SECTION 2 — Delete local implementations

Search and remove any local versions of these components:
```bash
grep -r "ReviewCard\|DecisionCard\|TradeOffBlock\|CommentThread" --include="*.tsx" -l
```
Remove any locally-defined versions and import from `@/components/ui/ds` instead.

---

## SECTION 3 — ReviewCard

Import: `import { ReviewCard } from '@/components/ui/ds'`

Props:
```tsx
<ReviewCard
  title="Review title"
  status="in-review"           // 'draft' | 'in-review' | 'approved' | 'needs-changes' | 'blocked'
  ownerName="Sarah Kim"
  ownerAvatarSrc={user.avatarUrl}
  dateLabel="Updated 2 days ago"
  description="What problem does this solve..."
  showDescription={true}
  hasArtifact={true}
  artifactLabel="Figma artifact attached"   // optional, defaults to "Figma artifact attached"
  tags={[
    { label: 'Navigation', variant: 'default' },
    { label: 'Mobile', variant: 'aqua' },
  ]}
  commentCount={3}
  decisionCount={1}
  onClick={() => router.push(`/reviews/${review.id}`)}
/>
```

Wire up in the project detail page right panel (Reviews section):
- Replace hardcoded ReviewCard instances with data from Supabase.
- Map `reviews` array from the database to ReviewCard props.
- `status` comes from `review.status` (ensure DB values match the type union).
- `hasArtifact` is `!!review.artifact_file_name`.

```tsx
{reviews.map(review => (
  <ReviewCard
    key={review.id}
    title={review.title}
    status={review.status as ReviewStatus}
    ownerName={review.owner_name}
    dateLabel={formatDistanceToNow(new Date(review.updated_at), { addSuffix: true })}
    description={review.description}
    hasArtifact={!!review.artifact_file_name}
    commentCount={review.comment_count ?? 0}
    decisionCount={review.decision_count ?? 0}
    onClick={() => openReview(review.id)}
  />
))}
```

---

## SECTION 4 — DecisionCard

Import: `import { DecisionCard } from '@/components/ui/ds'`

Props:
```tsx
<DecisionCard
  status="approved"            // 'approved' | 'changes-needed' | 'rejected' | 'closed'
  size="large"                 // 'large' | 'small'
  decisionText="We will proceed with a single-column layout..."
  ownerName="Sarah Kim"
  ownerAvatarSrc={user.avatarUrl}
  dateLabel="2 hours ago"
  options={[
    { label: 'Option 1a' },
    { label: 'Option 1b' },
  ]}
  hasTradeOff={true}
  tradeOffNote="Less information density in exchange for higher clarity per item."
  onMenuClick={() => openDecisionMenu(decision.id)}
/>
```

Wire up on the View Review page / drawer in the Decisions section.
The `size="small"` variant is for use in list/card contexts where vertical
space is constrained.

---

## SECTION 5 — TradeOffBlock

Import: `import { TradeOffBlock } from '@/components/ui/ds'`

Props:
```tsx
<TradeOffBlock
  note="Single column chosen based on rounds 2–3 stakeholder feedback."
  options={[
    {
      sentiment: 'success',
      heading: 'Clarity',
      body: 'Higher clarity, easier scanning for decision-heavy content.',
      pillLabel: 'Good',
      showKebab: true,
      onKebabClick: () => {},
    },
    {
      sentiment: 'brand',
      heading: 'Density',
      body: 'More information density. Context and content side-by-side.',
      actionLabel: 'Button',
      onActionClick: () => {},
    },
    // Add a third 'error' option for Variant2:
    {
      sentiment: 'error',
      heading: 'Risk',
      body: 'Higher cognitive load on smaller screens.',
      pillLabel: 'High',
      showKebab: true,
      onKebabClick: () => {},
    },
  ]}
/>
```

TradeOffBlock appears:
- Inside DecisionCard (the `hasTradeOff` prop triggers its own inline version)
- As a standalone component on the Create Decision / Review Detail page

---

## SECTION 6 — CommentThread

Import: `import { CommentThread } from '@/components/ui/ds'`

Props:
```tsx
<CommentThread
  type="feedback"       // 'feedback' | 'with-reply' | 'no-feedback' | 'decision-required' | 'decision'
  isStakeholder={true}
  authorName="Sarah Kim"
  authorAvatarSrc={user.avatarUrl}
  timestamp="2 hours ago"
  body="The feedback panel hierarchy feels unclear..."
  tag="Feedback"
  options={['Option 1']}
  onSend={(text) => submitReply(text)}
/>
```

Type guide:
- `feedback` — standard comment with reply input
- `with-reply` — comment that already has a reply (pass `reply` prop)
- `no-feedback` — placeholder row when stakeholder hasn't responded
- `decision-required` — warning row prompting stakeholder decision; pass `onMakeDecision`
- `decision` — lilac-tinted card showing a stakeholder's final decision

For `decision-required` with stakeholder:
```tsx
<CommentThread
  type="decision-required"
  isStakeholder={true}
  authorName="Alex Johnson"
  onMakeDecision={() => openDecisionModal()}
/>
```

Wire CommentThread in the Review Detail view wherever the comment/feedback
thread list is rendered.

---

## SECTION 7 — After all changes

1. `npx tsc --noEmit`
2. Pause OneDrive sync, `rd /s /q .next`, restart dev server
3. Verify:
   - Project detail right panel: reviews render as ReviewCard with correct status colours
   - Review detail: decisions render as DecisionCard with trade-off block
   - Review detail: comment thread shows correct type variant per stakeholder state
   - needs-changes ReviewCard: blush (#fef8dc) background, warning text colour
   - decision CommentThread: lilac background, green "Decision" tag
