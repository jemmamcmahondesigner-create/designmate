## DS Component Batch — Modal, Sidebar, ShowAccordion, Divider, NotificationBadge

Six new components added to `components/ui/ds/`. Wire them in using the
instructions below. Extraction order: Divider → NotificationBadge → ShowAccordion → Sidebar (dependencies). Modal is independent.

---

### 1. Update barrel export — components/ui/ds/index.ts

```ts
export { Divider } from './Divider';
export type { DividerProps, DividerOrientation } from './Divider';

export { NotificationBadge } from './NotificationBadge';
export type { NotificationBadgeProps, NotificationBadgeVariant, NotificationBadgeSentiment, NotificationBadgeProminence } from './NotificationBadge';

export { ShowAccordion } from './ShowAccordion';
export type { ShowAccordionProps, ShowAccordionState } from './ShowAccordion';

export { Modal } from './Modal';
export type { ModalProps, ModalType, ModalSize } from './Modal';

export { Sidebar } from './Sidebar';
export type { SidebarProps, SidebarState, SidebarProject } from './Sidebar';
```

---

### 2. Delete all locally-defined versions

Search and remove every local definition of:
- `function Divider(` / `function Modal(` / `function Sidebar(`
- `function ShowAccordion(` / `function NavItem(`
- `function NotificationBadge(` / `CircleImageChipMd` / `CircleImageChipLg`
- `IconsNavMark` (replaced by `<Icon name="nav-mark" />`)

---

### 3. Wire Divider

Import: `import { Divider } from '@/components/ui/ds'`

DividerProps:
  orientation?: 'horizontal' | 'vertical'  -- default: 'horizontal'
  className?: string

Usage: wherever a 1px separator line is needed between sections.
Replace every `<div className="bg-... h-px ...">` rule divider with `<Divider />`.

---

### 4. Wire NotificationBadge

Import: `import { NotificationBadge } from '@/components/ui/ds'`

NotificationBadgeProps:
  variant?: 'number' | 'dot'    -- default: 'number'
  count?: number                -- for variant='number'
  sentiment?: 'brand' | 'success' | 'warning' | 'error' | 'disabled'
  prominence?: 'high' | 'low'   -- default: 'high'. Use 'low' on dark/brand bg.
  className?: string

Usage in product:
- Sidebar project items: variant='dot' sentiment='success' — shows unread activity
- TabItem badge: variant='number' sentiment='brand' prominence='low'
- Replace every hardcoded badge dot/pill with this component.

---

### 5. Wire ShowAccordion

Import: `import { ShowAccordion } from '@/components/ui/ds'`

ShowAccordionProps:
  state?: 'more' | 'less' | 'view-all'  -- default: 'more'
  onClick?: () => void
  className?: string

Trigger logic (in Sidebar and project lists):
- Render ShowAccordion when projects.length > 5 (the maxVisible threshold).
- state='view-all' — shown in sidebar when list is truncated, links to full projects view.
- state='more' / state='less' — toggle to show/hide additional items inline.

Do NOT show ShowAccordion when projects.length <= 5.

---

### 6. Wire Modal

Import: `import { Modal } from '@/components/ui/ds'`

ModalProps:
  open: boolean                  -- (required) controls visibility
  type?: 'default' | 'destructive' | 'form' | 'information'
  size?: 'sm' | 'md' | 'lg'     -- sm=400px, md=560px, lg=720px
  title?: string
  subtitle?: string
  showSubtitle?: boolean
  children?: ReactNode           -- body content for form/information types
  description?: string           -- body text for default/destructive (if no children)
  confirmLabel?: string          -- overrides default CTA label per type
  onConfirm?: () => void         -- primary action handler
  onClose: () => void            -- (required) cancel/close/Escape handler
  learnMoreHref?: string         -- 'information' type only
  className?: string

Type guide:
- 'default'      → primary CTA, Confirm button (primary style)
- 'destructive'  → red header bg, Delete button (red style)
- 'form'         → children = form fields, Create/Save button (accent yellow)
- 'information'  → no primary action, Close + optional Learn more link

Built-in behaviours (do NOT re-implement in parent):
- Escape key closes modal
- Backdrop click closes modal
- Focus trap on open
- z-index: 510 (above Drawer at 400)

Common usages to wire up:
- "Create project" → type='form' size='md'
- "Delete review" → type='destructive' size='sm'
- "Confirm action" → type='default' size='sm'

---

### 7. Wire Sidebar

Import: `import { Sidebar, SidebarProject } from '@/components/ui/ds'`

SidebarProps:
  state?: 'default' | 'minimised' | 'expanded'
  activeNav?: 'projects' | 'reviews'
  projects?: SidebarProject[]
  projectsOpen?: boolean
  onProjectsToggle?: () => void
  onShowAll?: () => void
  onProjectClick?: (id: string) => void
  onReviewsClick?: () => void
  user?: { name: string; avatarSrc?: string }
  maxVisible?: number            -- default: 5. ShowAccordion appears above this.
  className?: string

SidebarProject shape:
  id: string
  name: string
  clientName: string
  hasActivity?: boolean          -- shows green dot badge
  active?: boolean               -- highlights item as selected

State guide:
- 'default'    → 240px, logo + labels visible, full project list
- 'minimised'  → 61px, logo mark only, icon-only nav
- 'expanded'   → 240px, same as default but Projects section expanded

Replace the existing hardcoded Sidebar instances in all page layouts with
this component. Pass real project data from your data layer.

The ShowAccordion is rendered automatically inside Sidebar when
projects.length > maxVisible. Do NOT render ShowAccordion separately.

---

### 8. After all changes

Run: `npx tsc --noEmit`
Fix all type errors before committing.
