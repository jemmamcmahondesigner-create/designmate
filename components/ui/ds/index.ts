/**
 * DesignMate DS — Component Package
 * components/ui/ds/index.ts
 *
 * Import all DS components from here. Do not import directly from component files.
 * Do not reimplement components that exist here — Cursor should compose, not invent.
 *
 * Usage:
 *   import { Button } from '@/components/ui/ds'
 *   import type { ButtonProps } from '@/components/ui/ds'
 */

// ─── Atoms ───────────────────────────────────────────────────────────────────

export { Button } from './Button'
export type { ButtonProps } from './Button'

export { Input } from './Input'
export type { InputProps } from './Input'

export { Icon, resolveIconName } from './Icon'
export type { IconName, IconProps } from './Icon'

// Coming next — extract via figma-to-ds-component skill:
// export { Select } from './Select'
// export type { SelectProps } from './Select'
// export { Textarea } from './Textarea'
// export type { TextareaProps } from './Textarea'
// export { Tag } from './Tag'
// export type { TagProps } from './Tag'
// export { StatusPill } from './StatusPill'
// export type { StatusPillProps } from './StatusPill'
// export { Checkbox } from './Checkbox'
// export type { CheckboxProps } from './Checkbox'

// ─── Molecules ────────────────────────────────────────────────────────────────

// export { ReviewCard } from './ReviewCard'
// export type { ReviewCardProps } from './ReviewCard'
// export { Stakeholder } from './Stakeholder'
// export type { StakeholderProps } from './Stakeholder'
// export { ProblemRow } from './ProblemRow'
// export type { ProblemRowProps } from './ProblemRow'
// export { ArtifactPreview } from './ArtifactPreview'
// export type { ArtifactPreviewProps } from './ArtifactPreview'
