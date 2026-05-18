## DS Component Batch — StatusPill, TabItem, Drawer, PageHeader

Four new components have been added to `components/ui/ds/`. Wire them into
the product following the instructions below. Do NOT reinvent or locally
redefine any of these components anywhere in the codebase.

---

### 1. Update barrel export — components/ui/ds/index.ts

Add these exports (in dependency order):

```ts
export { StatusPill } from './StatusPill';
export type { StatusPillProps, StatusPillStatus, StatusPillSize, StatusPillProminence, StatusPillState } from './StatusPill';

export { TabItem } from './TabItem';
export type { TabItemProps, TabItemStyle } from './TabItem';

export { Drawer } from './Drawer';
export type { DrawerProps, DrawerType, DrawerWidth } from './Drawer';

export { PageHeader } from './PageHeader';
export type { PageHeaderProps, PageHeaderVariant, PageHeaderTab } from './PageHeader';
```

---

### 2. Delete all locally-defined versions of these components

Search for and remove every local definition of:
- `function StatusPill(` / `type StatusPillProps`
- `function TabItem(` / `type TabItemProps`
- Any local Drawer implementation
- Any local PageHeader implementation

The only source of truth is `components/ui/ds/`.

---

### 3. Wire StatusPill

Import: `import { StatusPill, StatusPillStatus } from '@/components/ui/ds'`

StatusPillProps:
  label: string (required — the visible text)
  status?: 'draft' | 'in-review' | 'approved' | 'needs-changes' | 'blocked' | 'closed'
  size?: 'sm' | 'md' | 'lg'
  prominence?: 'default' | 'high'
  state?: 'default' | 'interactive'
  onClick?: () => void  -- lg + interactive only, opens status change menu
  className?: string

Usage rules:
- status controls COLOUR only. label is always editable text.
- 'interactive' state is lg only — adds chevron and opens a menu.
- Use prominence='high' when pill sits on a similar-toned background.
- Replace every hardcoded status chip/pill in ReviewCard, PageHeader, 
  and any other location with this component.

---

### 4. Wire TabItem

Import: `import { TabItem } from '@/components/ui/ds'`

TabItemProps:
  label: string (required)
  active?: boolean
  style?: 'pill' | 'underline'
  badgeCount?: number
  showBadge?: boolean
  onClick?: () => void
  className?: string

Usage rules:
- PageHeader with breadcrumb-tabs variant uses style='pill'
- Use role="tablist" on the wrapper, TabItem renders role="tab" internally
- Replace every hardcoded tab button in the product with this component

---

### 5. Wire Drawer

Import: `import { Drawer, DrawerType } from '@/components/ui/ds'`

DrawerProps:
  open: boolean (required)
  type?: 'detail' | 'edit' | 'create' | 'filter'
  width?: 360 | 480 | 600
  title?: string       -- overrides default title for the type
  subtitle?: string    -- overrides default subtitle for the type
  onClose: () => void  (required)
  children?: ReactNode -- body content (form fields, detail sections)
  footer?: ReactNode   -- pass null to suppress default footer; omit to use default
  className?: string

Width guide: detail=360, edit/create=480, filter=600
The component handles: Escape key, focus trap, scrim click-to-close.
Do NOT implement these behaviours in the parent — they are built in.

Replace the existing drawer implementation (currently inlined in the
Create Review workflow frames) with this component. The body content
(Input, Select, Textarea, artifact upload) is passed as children.

---

### 6. Wire PageHeader

Import: `import { PageHeader } from '@/components/ui/ds'`

PageHeaderProps:
  variant?: 'default' | 'detail' | 'breadcrumb-tabs' | 'breadcrumbs' | 'search'
  pageTitle?: string
  breadcrumb?: string        -- e.g. "Projects  /  Gem Designs & Signs"
  status?: StatusPillStatus  -- project/review status
  statusLabel?: string       -- e.g. "Active", "In Review"
  showStatus?: boolean
  tabs?: Array<{ label: string; badgeCount?: number }>
  activeTab?: number
  onTabChange?: (index: number) => void
  primaryAction?: string     -- default: "New Review"
  onPrimaryAction?: () => void
  onPrimaryActionMenu?: () => void
  onKebab?: () => void
  onSearch?: (value: string) => void
  className?: string

Variant guide:
- 'default'         — title + actions (projects list page)
- 'detail'          — title + status pill + actions (project/review page)
- 'breadcrumb-tabs' — breadcrumb + title + status + tabs + actions
- 'breadcrumbs'     — breadcrumb + title + status + actions (no tabs)
- 'search'          — search input replaces title

Replace every existing PageHeader instance in the product with this component.
Pass the correct variant based on the page context. Pass the correct
StatusPillStatus based on the project's current workflow status.

---

### 7. After all changes

Run: `npx tsc --noEmit`
Fix all type errors before committing.
