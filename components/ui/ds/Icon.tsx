/**
 * Icon — DesignTrace DS
 *
 * Paths from `public/icons/*.svg` are compiled into `publicIconsRegistry.ts`
 * (run `node scripts/generate-icon-registry.mjs` after changing SVGs).
 * Colour inherits via currentColor.
 */

import React from 'react'
import { ICONS, type PublicIconKey } from './publicIconsRegistry'

/** Re-export: SVG definitions compiled from `public/icons/*.svg`. */
export { ICONS, type PublicIconKey } from './publicIconsRegistry'

/** Icon names that are not a direct key of `ICONS` (aliases or inline-only). */
const EXTRA_ICON_NAMES = [
  'nav-archive',
  'nav-reviews',
  'nav-home',
  'nav-settings',
  'nav-decisions',
  'close-drawer',
  'open-drawer',
  'link',
  'check-circle-fill',
  'nav-mark',
  'share',
  'status-blocked',
  'upload',
] as const

export type IconName = PublicIconKey | (typeof EXTRA_ICON_NAMES)[number]

export const ICON_NAMES = Array.from(
  new Set<string>([...Object.keys(ICONS), ...EXTRA_ICON_NAMES]),
).sort() as IconName[]

const ICON_ALIAS_TO_PUBLIC: Partial<Record<IconName, PublicIconKey>> = {
  'nav-archive': 'archive',
  'nav-reviews': 'reviews',
  'nav-home': 'home',
  'nav-settings': 'settings',
  'nav-decisions': 'decisions',
}

function publicIconKeyFor(name: IconName): PublicIconKey | undefined {
  const aliased = ICON_ALIAS_TO_PUBLIC[name]
  if (aliased) return aliased
  if (Object.prototype.hasOwnProperty.call(ICONS, name)) return name as PublicIconKey
  return undefined
}

export type IconProps = {
  name: IconName
  size?: number
  className?: string
  style?: React.CSSProperties
  /** When set, icon is exposed to assistive tech (e.g. standalone control). */
  'aria-label'?: string
}

function SvgFromRegistry({
  def,
  size,
  ariaLabel,
}: {
  def: { viewBox: string; innerHtml: string }
  size: number
  ariaLabel?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox={def.viewBox}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: 'block', flexShrink: 0, color: 'inherit' }}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
      focusable="false"
      dangerouslySetInnerHTML={{ __html: def.innerHtml }}
    />
  )
}

function SvgRoot({
  size,
  children,
  className,
  style,
  ariaLabel,
}: {
  size: number
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  ariaLabel?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      style={{ display: 'block', flexShrink: 0, color: 'inherit', ...style }}
      aria-hidden={ariaLabel ? undefined : true}
      aria-label={ariaLabel}
      role={ariaLabel ? 'img' : undefined}
      focusable="false"
    >
      {children}
    </svg>
  )
}

export function Icon({
  name,
  size = 16,
  className,
  style,
  'aria-label': ariaLabel,
}: IconProps) {
  const regKey = publicIconKeyFor(name)
  if (regKey) {
    const def = ICONS[regKey]
    return (
      <span
        className={`inline-flex shrink-0 items-center justify-center text-current ${className ?? ''}`}
        style={style}
      >
        <SvgFromRegistry def={def} size={size} ariaLabel={ariaLabel} />
      </span>
    )
  }

  const stroke = 'currentColor'
  const strokeW = 1.75

  const inner = (() => {
    switch (name) {
      case 'close-drawer':
        return (
          <>
            <rect
              x="3"
              y="4"
              width="18"
              height="16"
              rx="2"
              stroke={stroke}
              strokeWidth={strokeW}
            />
            <path
              d="M15 4v16"
              stroke={stroke}
              strokeWidth={strokeW}
              strokeLinecap="round"
            />
            <path
              d="M10.5 9.5l-2.5 2.5 2.5 2.5"
              stroke={stroke}
              strokeWidth={strokeW}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )
      case 'open-drawer':
        return (
          <>
            <rect
              x="3"
              y="4"
              width="18"
              height="16"
              rx="2"
              stroke={stroke}
              strokeWidth={strokeW}
            />
            <path
              d="M15 4v16"
              stroke={stroke}
              strokeWidth={strokeW}
              strokeLinecap="round"
            />
            <path
              d="M8 9.5l2.5 2.5-2.5 2.5"
              stroke={stroke}
              strokeWidth={strokeW}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )
      case 'upload':
        return (
          <>
            <path
              d="M12 15V4M8 8l4-4 4 4"
              stroke={stroke}
              strokeWidth={strokeW}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M5 20h14"
              stroke={stroke}
              strokeWidth={strokeW}
              strokeLinecap="round"
            />
          </>
        )
      case 'check-circle-fill':
        return (
          <>
            <circle cx="12" cy="12" r="10" fill="#2a8a45" />
            <path
              d="M7.5 12l3 3 6-6"
              stroke="#ffffff"
              strokeWidth={strokeW}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )
      case 'link':
        return (
          <path
            d="M10.5 15.5a3.5 3.5 0 01-4.95-4.95l1.06-1.06a3.5 3.5 0 014.95 4.95M13.5 8.5a3.5 3.5 0 014.95 4.95l-1.06 1.06a3.5 3.5 0 01-4.95-4.95M9 15l6-6"
            stroke={stroke}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      case 'status-blocked':
        return (
          <>
            <circle cx="12" cy="12" r="9" stroke={stroke} strokeWidth={strokeW} />
            <path
              d="M12 8v5M12 16v.5"
              stroke={stroke}
              strokeWidth={strokeW}
              strokeLinecap="round"
            />
          </>
        )
      case 'nav-mark':
        return (
          <path
            d="M6 4h7l2 3v13l-4 2-4-2V4z"
            stroke={stroke}
            strokeWidth={strokeW}
            strokeLinejoin="round"
          />
        )
      case 'share':
        return (
          <>
            <circle cx="18" cy="5" r="3" stroke={stroke} strokeWidth={strokeW} />
            <circle cx="6" cy="12" r="3" stroke={stroke} strokeWidth={strokeW} />
            <circle cx="18" cy="19" r="3" stroke={stroke} strokeWidth={strokeW} />
            <path
              d="M8.5 10.5l7-3M8.5 13.5l7 3"
              stroke={stroke}
              strokeWidth={strokeW}
              strokeLinecap="round"
            />
          </>
        )
      default:
        return null
    }
  })()

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center text-current ${className ?? ''}`}
      style={style}
    >
      <SvgRoot size={size} ariaLabel={ariaLabel}>
        {inner}
      </SvgRoot>
    </span>
  )
}

/** Maps legacy `iconName` strings from older screens to registry names. */
const LEGACY_ICON: Partial<Record<string, IconName>> = {
  x: 'close',
  'arrow-right': 'chevron-right',
  'arrow-left': 'chevron-left',
  'arrow-up': 'chevron-up',
  'link-simple': 'link',
  'upload-simple': 'upload',
  'dots-three-vertical': 'kebab',
  'check-square': 'check',
  'plus-circle': 'plus',
}

export function resolveIconName(raw?: string): IconName | undefined {
  if (!raw) return undefined
  if (ICON_NAMES.includes(raw as IconName)) return raw as IconName
  return LEGACY_ICON[raw]
}

export default Icon
