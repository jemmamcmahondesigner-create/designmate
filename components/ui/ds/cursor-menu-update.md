# Menu Update — Multi-select, Footer Actions, Fill-width

The DLS Menu has been redesigned with new types and sub-components.
Replace `components/ui/ds/Menu.tsx` and `Menu.module.css` with the new files.

Run `npx tsc --noEmit` after each section.

---

## What changed

### Four types (was three)
| Type | Items | Footer |
|------|-------|--------|
| `dropdown` | icon + label (unchanged) | none |
| `context-menu` | icon + label, active has check (unchanged) | none |
| `action-menu` | icon + label, active has check | Delete (red, trash icon) |
| `multi-select` | checkbox + avatar + label | Link (brand colour, plus icon) |

### MenuItem now has checkbox + avatar variants
```tsx
// Icon type (default — unchanged)
<MenuItem label="New Review" icon="nav-reviews" onClick={...} />

// Avatar type (multi-select)
<MenuItem label="Sarah Kim" avatarSrc={url} avatarName="Sarah Kim" checkbox active onClick={...} />
```

### MenuFooter is now a named export
```tsx
// Used automatically via footerAction prop on Menu:
footerAction={{ type: 'link', label: 'Create new contributor', onClick: ... }}
footerAction={{ type: 'delete', label: 'Delete', onClick: ... }}
```

### Width and positioning (CRITICAL CHANGE)
- Menu fills trigger width — `min-width: 240px; width: 100%`
- Every trigger + menu pair needs `position: relative` on the shared wrapper
- Gap from trigger: `top: calc(100% + 4px)` — already in CSS

---

## SECTION 1 — Update barrel export

In `components/ui/ds/index.ts`, update the Menu line:

```ts
export { Menu, MenuItem, MenuFooter } from './Menu';
export type { MenuProps, MenuItemProps, MenuFooterProps, MenuType, MenuFooterType } from './Menu';
```

---

## SECTION 2 — Fix all existing Menu wrapper divs

Search for every existing `<Menu` usage:
```bash
grep -rn "<Menu" --include="*.tsx" .
```

For each one, ensure the parent wrapper has `position: relative`:

```tsx
// BEFORE (missing position: relative — menu will escape to wrong position)
<div className={styles.headerActions}>
  <ButtonGroup onArrowClick={() => setOpen(o => !o)} ... />
  <Menu open={open} ... />
</div>

// AFTER
<div className={styles.headerActions} style={{ position: 'relative' }}>
  <ButtonGroup onArrowClick={() => setOpen(o => !o)} ... />
  <Menu open={open} ... />
</div>
```

Or if using CSS modules, add `position: relative` to the wrapper class.

---

## SECTION 3 — Upgrade contributor picker to multi-select

Find: `CreateReviewDrawer.tsx` (or equivalent) — the section where reviewers
or contributors are selected. It likely uses `SelectField + Menu` or a combobox.

Replace with the `multi-select` pattern:

```tsx
import { useState, useRef } from 'react';
import { Menu, MenuItem } from '@/components/ui/ds';

// State
const [contributorMenuOpen, setContributorMenuOpen] = useState(false);
const [selectedIds, setSelectedIds] = useState<string[]>([]);

const toggle = (id: string) =>
  setSelectedIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

// JSX — wrapper must be position: relative
<div style={{ position: 'relative' }}>
  <button
    type="button"
    onClick={() => setContributorMenuOpen(o => !o)}
    className={styles.selectField}  // use existing select field styling
  >
    {selectedIds.length > 0 ? `${selectedIds.length} selected` : 'Add reviewers'}
  </button>

  <Menu
    open={contributorMenuOpen}
    onClose={() => setContributorMenuOpen(false)}
    type="multi-select"
    align="left"
    aria-label="Select reviewers"
    footerAction={{
      type: 'link',
      label: 'Create new contributor',
      onClick: () => {
        setContributorMenuOpen(false);
        // open create contributor modal or inline form
      },
    }}
  >
    {allContributors.map(c => (
      <MenuItem
        key={c.id}
        label={c.name}
        avatarSrc={c.avatar_url ?? undefined}
        avatarName={c.name}
        checkbox
        active={selectedIds.includes(c.id)}
        onClick={() => toggle(c.id)}
      />
    ))}
  </Menu>
</div>
```

---

## SECTION 4 — Upgrade kebab menus to action-menu

Find all kebab (⋮) button menus in the product. These should be
`type="action-menu"` so the delete action appears with a red footer:

```tsx
<div style={{ position: 'relative' }}>
  <button
    type="button"
    className={styles.kebabBtn}
    onClick={() => setOpen(o => !o)}
    aria-label="More options"
  >
    <Icon name="kebab" size={14} />
  </button>

  <Menu
    open={open}
    onClose={() => setOpen(false)}
    type="action-menu"
    align="right"
    footerAction={{
      type: 'delete',
      label: 'Delete',
      onClick: () => { setOpen(false); handleDelete(item.id); },
    }}
  >
    <MenuItem label="Edit" icon="edit" onClick={() => { setOpen(false); handleEdit(); }} />
  </Menu>
</div>
```

Apply to:
- Problem row `...` kebabs (ProblemsSection.tsx)
- Contributor row `...` kebabs (ContributorsSection.tsx)
- Any other `...` menus in the product

---

## SECTION 5 — TypeScript cleanup

If the old `Menu` had a `type` prop with `'Multi Select'` (from Figma codegen),
rename all references to `'multi-select'` (kebab-case, our convention).

If `MenuSeparator` was exported, remove it — the divider is now internal.

---

## SECTION 6 — After all changes

1. `npx tsc --noEmit` — must pass clean
2. Pause OneDrive, `rd /s /q .next`, restart dev
3. Verify:
   - "New Review ▾" button → menu fills button width exactly, 4px below
   - Contributor field → avatar items with checkboxes, "Create new contributor" link at bottom
   - Problem row `...` → regular items + red "Delete" with divider
   - Escape and outside-click both close the menu
   - Active/checked state toggles correctly on click
