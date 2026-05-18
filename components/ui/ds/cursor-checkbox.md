# Checkbox — DS Component Installation

Install the DS Checkbox and replace all local checkbox implementations.
Run `npx tsc --noEmit` after completing all sections.

---

## SECTION 1 — Copy files into DS package

Copy into `components/ui/ds/`:
- `Checkbox.tsx`
- `Checkbox.module.css`

Add to `components/ui/ds/index.ts`:

```ts
export { Checkbox } from './Checkbox';
export type { CheckboxProps, CheckboxState, CheckboxSentiment } from './Checkbox';
```

---

## SECTION 2 — Props reference

```tsx
import { Checkbox } from '@/components/ui/ds';

<Checkbox
  label="Accept terms"          // visible text label
  checked={isChecked}           // controlled
  indeterminate={isPartial}     // overrides checked visually
  sentiment="base"              // 'base' | 'danger'
  disabled={false}
  strikethrough={false}         // strikes label when checked
  onChange={setIsChecked}       // (checked: boolean) => void
  id="my-checkbox"              // optional, auto-generated if omitted
  name="terms"
  value="accept"
  className=""                  // layout only
/>
```

States driven by props — no `state` prop needed:
- `checked=false` → unchecked
- `checked=true` → checked (filled burgundy)
- `indeterminate=true` → dash icon (overrides checked)
- `sentiment="danger"` → red border on unchecked state
- `disabled=true` → muted, non-interactive
- `strikethrough=true` + `checked=true` → label struck through

---

## SECTION 3 — Replace local checkbox usages

Search the codebase for any local checkbox implementations:

```bash
grep -r "type=\"checkbox\"" --include="*.tsx" -l
grep -r "checkbox" --include="*.tsx" -l
```

For each file found, replace the local implementation with the DS component.

Common patterns to replace:

**Pattern A — raw input:**
```tsx
// BEFORE
<input type="checkbox" checked={val} onChange={e => setVal(e.target.checked)} />

// AFTER
<Checkbox checked={val} onChange={setVal} />
```

**Pattern B — with label:**
```tsx
// BEFORE
<label>
  <input type="checkbox" ... />
  Accept terms
</label>

// AFTER
<Checkbox label="Accept terms" checked={val} onChange={setVal} />
```

**Pattern C — indeterminate (select all):**
```tsx
// BEFORE
const ref = useRef<HTMLInputElement>(null);
useEffect(() => { if (ref.current) ref.current.indeterminate = someCondition; }, [someCondition]);
<input ref={ref} type="checkbox" ... />

// AFTER
<Checkbox indeterminate={someCondition} checked={allSelected} onChange={handleSelectAll} />
```

---

## SECTION 4 — Specific product locations

Check these areas of the product which likely need checkboxes wired up:

### 4a. Create Review drawer — related problems / trade-offs
If the Create Review drawer has any checkbox lists for selecting related
problems, trade-offs, or stakeholders, wire the DS Checkbox there.

### 4b. Filter panels
If any filter or sort panel uses checkboxes for options, replace with DS Checkbox.

### 4c. Settings or permissions (if built)
Any settings toggle implemented as a checkbox should use the DS Checkbox.

---

## SECTION 5 — After all changes

1. `npx tsc --noEmit`
2. Pause OneDrive sync, `rd /s /q .next`, restart dev server
3. Verify:
   - Unchecked: white box, grey border
   - Hover unchecked: border darkens
   - Checked: solid burgundy box with white tick
   - Hover checked: box darkens to #5a1826
   - Indeterminate: burgundy box with white dash
   - Disabled: all states muted, non-interactive
   - Danger: red border on unchecked
   - Strikethrough: struck label on checked
   - Focus: burgundy 3px ring on keyboard navigation
