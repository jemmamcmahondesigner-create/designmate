/**
 * DesignTrace DS — Component Package
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

export { IconSquareButton } from './IconSquareButton'
export type { IconSquareButtonProps } from './IconSquareButton'

export { Select } from './Select'
export type { SelectProps, SelectOption, SelectSize } from './Select'

/** Control shell paired with `Menu` for searchable / multi patterns */
export { Select as SelectField } from './Select/Select'
export type { SelectProps as SelectFieldProps } from './Select/Select'

export { Menu, MenuItem, MenuFooter, MenuSectionHeading } from './Menu'
export type {
  MenuProps,
  MenuItemProps,
  MenuFooterProps,
  MenuType,
  MenuFooterType,
  MenuSectionsState,
  MenuSectionsReviewer
} from './Menu'

export { Alert } from './Alert'
export type { AlertProps, AlertSentiment, AlertProminence } from './Alert'

export { ProductCard } from './ProductCard'
export type { ProductCardProps, ProductCardContributor } from './ProductCard'

export { Tag } from './Tag'
export type { TagProps, TagVariant, TagSize, TagIcon } from './Tag'

export { StatusPill, STATUS_PILL_DISPLAY, resolveStatusPillDisplay } from './StatusPill'
export type {
  StatusPillProps,
  StatusPillStatus,
  StatusPillColor,
  StatusPillAppearance,
  StatusPillSize,
  StatusPillProminence,
  StatusPillState,
  StatusPillDisplay,
} from './StatusPill'

export { TabItem } from './TabItem'
export type { TabItemProps, TabItemStyle } from './TabItem'

export { Drawer } from './Drawer'
export type { DrawerProps, DrawerType, DrawerWidth } from './Drawer'

export { Breadcrumb } from './Breadcrumb'
export type {
  BreadcrumbProps,
  BreadcrumbSegment,
  BreadcrumbVariant,
} from './Breadcrumb'

export { PageHeader } from './PageHeader'
export type {
  PageHeaderProps,
  PageHeaderVariant,
  PageHeaderTab,
  PageHeaderBreadcrumbSegment
} from './PageHeader'

export { Textarea } from './Textarea'
export type { TextareaProps, TextareaSize, TextareaState, TextareaVariant } from './Textarea'

export { TextareaAi } from './TextareaAi'
export type { TextareaAiProps } from './TextareaAi'

export { Avatar, getDisplayNameInitials } from './Avatar'
export type { AvatarProps, AvatarSize } from './Avatar'

export { Tooltip } from './Tooltip'
export type { TooltipProps, TooltipPosition } from './Tooltip'

export { ButtonGroup } from './ButtonGroup'
export type {
  ButtonGroupProps,
  ButtonGroupVariant,
  ButtonGroupSize
} from './ButtonGroup'

export { Divider } from './Divider'
export type { DividerProps, DividerOrientation } from './Divider'

export { NotificationBadge } from './NotificationBadge'
export type {
  NotificationBadgeProps,
  NotificationBadgeVariant,
  NotificationBadgeSentiment,
  NotificationBadgeProminence
} from './NotificationBadge'

export { Skeleton } from './Skeleton'
export type { SkeletonProps, SkeletonShape, SkeletonBackground } from './Skeleton'

export { ShowAccordion } from './ShowAccordion'
export type { ShowAccordionProps, ShowAccordionState } from './ShowAccordion'

export { Modal } from './Modal'
export type { ModalProps, ModalType, ModalSize } from './Modal'

export { Sidebar } from './Sidebar'
export type { SidebarProps, SidebarProject } from './Sidebar'

export { Table } from './Table'
export type {
  TableProps,
  ColumnDef,
  ColumnRenderContext,
  TableCellType,
  TablePagination,
  TablePageSizeOption,
} from './Table'

export { Checkbox } from './Checkbox'
export type { CheckboxProps, CheckboxState, CheckboxSentiment } from './Checkbox'

export { FilterPanel } from './FilterPanel'
export type {
  FilterPanelProps,
  FilterPanelGroup,
  FilterPanelAllRow,
  FilterPanelCheckboxItem,
  FilterPanelPersonItem,
} from './FilterPanel'

// ─── Molecules ────────────────────────────────────────────────────────────────

export { ReviewCard } from './ReviewCard'
export type { ReviewCardProps, ReviewStatus } from './ReviewCard'

export { DecisionCard } from './DecisionCard'
export type {
  DecisionCardProps,
  DecisionCardChangeRequestItem,
  DecisionStatus,
  DecisionOption
} from './DecisionCard'

export { TradeOffBlock } from './TradeOffBlock'
export type {
  TradeOffBlockProps,
  TradeOffOption,
  TradeOffSentiment
} from './TradeOffBlock'

export { CommentThread } from './CommentThread'
export type {
  CommentThreadProps,
  CommentThreadType,
  CommentReply,
  CommentOption
} from './CommentThread'

export { TimelineEventCard } from './TimelineEventCard'
export type { TimelineEventCardProps } from './TimelineEventCard'

export { TimelineDateDivider } from './TimelineDateDivider'

// export { Stakeholder } from './Stakeholder'
// export type { StakeholderProps } from './Stakeholder'
// export { ProblemRow } from './ProblemRow'
// export type { ProblemRowProps } from './ProblemRow'
export { ArtifactPreview } from './ArtifactPreview'
export type {
  ArtifactPreviewProps,
  ArtifactPreviewSize,
  ArtifactPreviewFileType,
  ArtifactPreviewMode,
  ArtifactPreviewState,
  ArtifactDescriptionState,
} from './ArtifactPreview'
