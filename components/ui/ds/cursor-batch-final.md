# DS Sprint — Select, Menu, Alert, ProductCard + Icon Replacement

Two tasks in this prompt. Run them in order.
Run `npx tsc --noEmit` after completing each section.

---

## TASK 1 — Install four new DS components

Copy these files into `components/ui/ds/`:
- Select.tsx + Select.module.css
- Menu.tsx + Menu.module.css
- Alert.tsx + Alert.module.css
- ProductCard.tsx + ProductCard.module.css

Add to `components/ui/ds/index.ts`:

```ts
export { Select } from './Select';
export type { SelectProps, SelectOption, SelectSize } from './Select';

export { Menu, MenuItem } from './Menu';
export type { MenuProps, MenuItemProps } from './Menu';

export { Alert } from './Alert';
export type { AlertProps, AlertSentiment, AlertProminence } from './Alert';

export { ProductCard } from './ProductCard';
export type { ProductCardProps, ProductCardContributor } from './ProductCard';
```

---

## SECTION 1a — Wire Select into Create Review drawer

The Create Review drawer (Step 1) has a review type field. Replace any
raw `<select>` element or local implementation with the DS Select:

```tsx
import { Select } from '@/components/ui/ds';

<Select
  label="Review type"
  options={[
    { value: 'design-review', label: 'Design Review' },
    { value: 'accessibility', label: 'Accessibility Review' },
    { value: 'stakeholder', label: 'Stakeholder Review' },
  ]}
  value={reviewType}
  onChange={setReviewType}
  placeholder="Select a type"
  size="sm"
/>
```

Also wire Select into the ArtifactPreview editable footer for the
iteration picker — replace the raw `<select>` in ArtifactPreview.tsx:

```tsx
// In ArtifactPreview.tsx, replace the <select> element with:
import { Select } from './Select';

<Select
  options={iterationOptions.map(opt => ({ value: opt, label: opt }))}
  value={iteration}
  onChange={val => onIterationChange?.(val)}
  placeholder="Select iteration"
  size="sm"
/>
```

---

## SECTION 1b — Wire Menu into ButtonGroup (New Review button)

The PageHeader / project detail header has a "New Review ▾" ButtonGroup.
When the chevron is clicked, a Menu should appear with options.

Find the existing ButtonGroup trigger and add Menu:

```tsx
import { Menu, MenuItem } from '@/components/ui/ds';

const [menuOpen, setMenuOpen] = useState(false);
const triggerRef = useRef<HTMLButtonElement>(null);

// On the ButtonGroup arrow-trigger onClick:
// setMenuOpen(o => !o)

// Render the menu positioned relative to the ButtonGroup:
<div style={{ position: 'relative', display: 'inline-flex' }}>
  <ButtonGroup
    label="New Review"
    variant="primary"
    size="sm"
    onArrowClick={() => setMenuOpen(o => !o)}
    arrowRef={triggerRef}
  />
  <Menu
    open={menuOpen}
    onClose={() => setMenuOpen(false)}
    anchorRef={triggerRef}
    align="right"
    aria-label="New item options"
  >
    <MenuItem
      label="New Review"
      icon="nav-reviews"
      onClick={() => { setMenuOpen(false); openCreateReview(); }}
    />
    <MenuItem
      label="New Decision"
      icon="nav-decisions"
      onClick={() => { setMenuOpen(false); openCreateDecision(); }}
    />
  </Menu>
</div>
```

Note: ButtonGroup.tsx needs an `onArrowClick` prop and `arrowRef` prop added
if they don't exist. Add them:

```tsx
// In ButtonGroup.tsx, add to props:
onArrowClick?: () => void;
arrowRef?: React.Ref<HTMLButtonElement>;

// Pass arrowRef to the arrow-trigger button element
```

---

## SECTION 1c — Wire Alert for toast/notification feedback

The Alert component is used for in-page feedback (undo toasts, error
states, success confirmations). It is NOT the same as the undo toast
(which uses its own component).

Use Alert for:
- Form validation errors at the top of drawers
- Success confirmation after creating a review
- Warning when a required field is empty

Example usage in a drawer or page:

```tsx
import { Alert } from '@/components/ui/ds';

{formError && (
  <Alert
    sentiment="danger"
    prominence="low"
    title="Something went wrong"
    body={formError}
    dismissible={true}
    onDismiss={() => setFormError(null)}
  />
)}

{saveSuccess && (
  <Alert
    sentiment="success"
    prominence="low"
    title="Review created"
    body="Your review has been saved successfully."
    dismissible={true}
    onDismiss={() => setSaveSuccess(false)}
  />
)}
```

---

## SECTION 1d — Wire ProductCard into Projects list page

Find the Projects list page where project tiles are rendered. Replace any
local card implementation with the DS ProductCard:

```tsx
import { ProductCard } from '@/components/ui/ds';

{projects.map(project => (
  <ProductCard
    key={project.id}
    title={project.name}
    statusLabel={project.status ?? 'Active'}
    reviewCount={project.review_count ?? 0}
    decisionCount={project.decision_count ?? 0}
    description={project.description}
    tagLabel={project.client_name}
    contributors={project.contributors?.map(c => ({
      name: c.name,
      avatarSrc: c.avatar_url,
    })) ?? []}
    onClick={() => router.push(`/projects/${project.id}`)}
  />
))}
```

---

## TASK 2 — Replace all Figma CDN icon URLs with <Icon />

The sidebar and other components still contain `<img>` tags pointing to
`figma.com/api/mcp/asset/...` URLs. These expire in 7 days. Replace all
of them with the DS Icon component.

### 2a. Find all files with expiring URLs

```bash
grep -r "figma.com/api/mcp/asset" --include="*.tsx" -l
```

### 2b. Replace pattern

For every file found, import Icon and replace each `<img>` usage:

```tsx
import { Icon } from '@/components/ui/ds';

// BEFORE (expires):
<img alt="" className="absolute block inset-0 max-w-none size-full" src={imgVector} />

// AFTER:
<Icon name="[correct-icon-name]" size={[N]} />
```

### 2c. Component-by-component replacements

**Sidebar.tsx**
```tsx
// Brand mark (nav-mark icon)
<Icon name="nav-mark" size={24} />

// Projects nav item
<Icon name="nav-archive" size={20} />

// Reviews nav item  
<Icon name="nav-reviews" size={20} />

// Settings nav item
<Icon name="nav-settings" size={20} />

// Chevrons for accordion open/close
<Icon name="chevron-down" size={16} />
<Icon name="chevron-up" size={16} />
<Icon name="chevron-right" size={16} />
```

**PageHeader.tsx**
```tsx
<Icon name="search" size={16} />
<Icon name="kebab" size={14} />
<Icon name="chevron-down" size={14} />  // ButtonGroup trigger
```

**ButtonGroup.tsx**
```tsx
// Replace imgVector chevron-down in all variants:
<Icon name="chevron-down" size={14} />  // sm
<Icon name="chevron-down" size={16} />  // md
<Icon name="chevron-down" size={20} />  // lg
```

**Modal.tsx**
```tsx
<Icon name="close" size={14} />
```

**ShowAccordion.tsx**
```tsx
<Icon name="chevron-down" size={14} />
<Icon name="chevron-right" size={14} />
```

**ReviewCard.tsx** — no icon img tags expected

**DecisionCard.tsx**
```tsx
<Icon name="kebab" size={14} />
<Icon name="ai-stars" size={20} />
```

**TradeOffBlock.tsx**
```tsx
<Icon name="info" size={16} />
<Icon name="plus" size={16} />
<Icon name="kebab" size={14} />
```

**CommentThread.tsx**
```tsx
<Icon name="status-blocked" size={16} />
<Icon name="drill-down" size={20} />
```

**ArtifactPreview.tsx**
```tsx
<Icon name="plus" size={14} />
```

### 2d. Verify zero CDN URLs remain

```bash
grep -r "figma.com/api/mcp/asset" --include="*.tsx"
```

This must return no output. If anything appears, track it down and replace.

---

## After all changes

1. `npx tsc --noEmit` — must pass clean
2. Pause OneDrive sync, `rd /s /q .next`, restart dev server
3. Check in browser:
   - Projects page: ProductCards render with title, status, counts, description, avatars
   - Select: opens dropdown, selects option, shows filled state
   - Menu: opens on ButtonGroup chevron click, closes on outside click and Escape
   - Alert: danger variant visible on form error, success on save
   - Sidebar icons: all render as crisp SVGs (not blurry PNGs)
   - No broken image icons anywhere
