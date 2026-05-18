## DS Component Batch — Textarea, Avatar, Tooltip, ButtonGroup

Four new components added to `components/ui/ds/`. Wire them in following
the instructions below. Do NOT locally redefine any of these.

---

### 1. Update barrel export — components/ui/ds/index.ts

```ts
export { Textarea } from './Textarea';
export type { TextareaProps, TextareaSize, TextareaState } from './Textarea';

export { Avatar } from './Avatar';
export type { AvatarProps, AvatarSize } from './Avatar';

export { Tooltip } from './Tooltip';
export type { TooltipProps, TooltipPosition } from './Tooltip';

export { ButtonGroup } from './ButtonGroup';
export type { ButtonGroupProps, ButtonGroupVariant, ButtonGroupSize } from './ButtonGroup';
```

---

### 2. Delete all locally-defined versions

Search and remove every local definition of:
- `function Textarea(` / `type TextareaProps`
- `function Avatar(` / `type AvatarProps` / `CircleImageChipMd` / `CircleImageChipLg`
- `function Tooltip(` / `type TooltipProps`
- `function ButtonGroup(` / `type ButtonGroupProps`

---

### 3. Wire Textarea

Import: `import { Textarea } from '@/components/ui/ds'`

TextareaProps:
  label?: string
  showLabel?: boolean
  placeholder?: string
  helperText?: string
  showHelper?: boolean
  errorText?: string        -- shown below field in error state
  value?: string
  defaultValue?: string
  size?: 'sm' | 'md' | 'lg'  -- sm=80px min, md=100px min, lg=120px min
  state?: 'default' | 'error' | 'disabled' | 'read-only'
  rows?: number
  onChange?: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  id?: string
  name?: string
  className?: string        -- for layout positioning only

Usage rules:
- Width is ALWAYS fill container (100%). Never set a fixed width.
- Height is a fixed minimum — content scrolls within. Use rows prop to extend.
- read-only: use for review detail panels where content is non-editable.
- Replace every existing textarea implementation in the product.

---

### 4. Wire Avatar

Import: `import { Avatar } from '@/components/ui/ds'`

AvatarProps:
  src?: string        -- image URL. Falls back to initials if omitted.
  alt?: string
  name?: string       -- used for initials fallback and aria-label
  size?: 'md' | 'lg' -- md=24px, lg=32px
  className?: string

Usage rules:
- Always pass name even when src is provided (used for alt text).
- Replace every CircleImageChipMd / CircleImageChipLg usage with Avatar.
- Pass src from the user's actual profile data. Do NOT hardcode placeholder image URLs.

---

### 5. Wire Tooltip

Import: `import { Tooltip } from '@/components/ui/ds'`

TooltipProps:
  label: string             -- primary tooltip text (required)
  supportingText?: string   -- optional second line in muted colour
  position?: 'top' | 'bottom' | 'left' | 'right'  -- default: 'top'
  children: React.ReactNode -- the trigger element
  className?: string

Usage rules:
- Wrap icon-only buttons to provide accessible labels.
- Never use for critical information (it's not always visible).
- The component handles show/hide on hover and focus-visible automatically.

Example:
  <Tooltip label="Remove reviewer" position="top">
    <button aria-label="Remove reviewer" onClick={...}>
      <Icon name="close" size={14} />
    </button>
  </Tooltip>

---

### 6. Wire ButtonGroup

Import: `import { ButtonGroup } from '@/components/ui/ds'`

ButtonGroupProps:
  label: string                          -- primary action label (required)
  variant?: 'primary' | 'secondary' | 'ghost'
  size?: 'sm' | 'md' | 'lg'
  onPrimaryClick?: () => void            -- primary label click
  onMenuClick?: () => void               -- chevron click (opens menu)
  menuAriaLabel?: string                 -- default: "More options"
  disabled?: boolean
  className?: string

Usage rules:
- Use in PageHeader for the "New Review ▾" primary action.
- onMenuClick should open a Menu component (not yet extracted — use a
  state toggle + absolute-positioned menu div for now).
- Replaces the inline ButtonGroup markup currently hardcoded in PageHeader.
- Update PageHeader to use this component instead of its inline implementation.

---

### 7. After all changes

Run: `npx tsc --noEmit`
Fix all type errors before committing.
