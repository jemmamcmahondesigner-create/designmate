/**
 * Icon — DesignMate DS
 *
 * Renders named SVGs from the DLS registry. Colour via currentColor on the parent.
 */

import React from 'react'

export const ICON_NAMES = [
  'plus',
  'close',
  'upload',
  'stretch',
  'kebab',
  'search',
  'check',
  'chevron-down',
  'chevron-right',
  'chevron-left',
  'link',
  'nav-mark',
  'nav-archive',
  'nav-reviews',
] as const

export type IconName = (typeof ICON_NAMES)[number]

export type IconProps = {
  name: IconName
  size?: number
  className?: string
  style?: React.CSSProperties
  /** When set, icon is exposed to assistive tech (e.g. standalone control). */
  'aria-label'?: string
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
  const stroke = 'currentColor'
  const strokeW = 1.75

  const inner = (() => {
    switch (name) {
      case 'plus':
        return (
          <path
            d="M12 5v14M5 12h14"
            stroke={stroke}
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
        )
      case 'close':
        return (
          <path
            d="M6 6l12 12M18 6L6 18"
            stroke={stroke}
            strokeWidth={strokeW}
            strokeLinecap="round"
          />
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
      case 'stretch':
        return (
          <>
            <path
              d="M9 3H4v5M15 3h5v5M15 21h5v-5M9 21H4v-5"
              stroke={stroke}
              strokeWidth={strokeW}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </>
        )
      case 'kebab':
        return (
          <>
            <circle cx="6" cy="12" r="1.5" fill={stroke} />
            <circle cx="12" cy="12" r="1.5" fill={stroke} />
            <circle cx="18" cy="12" r="1.5" fill={stroke} />
          </>
        )
      case 'search':
        return (
          <>
            <circle cx="10.5" cy="10.5" r="5.5" stroke={stroke} strokeWidth={strokeW} />
            <path
              d="M15 15l5 5"
              stroke={stroke}
              strokeWidth={strokeW}
              strokeLinecap="round"
            />
          </>
        )
      case 'check':
        return (
          <path
            d="M5 12l4 4L19 7"
            stroke={stroke}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      case 'chevron-down':
        return (
          <path
            d="M6 9l6 6 6-6"
            stroke={stroke}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      case 'chevron-right':
        return (
          <path
            d="M9 6l6 6-6 6"
            stroke={stroke}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )
      case 'chevron-left':
        return (
          <path
            d="M15 6l-6 6 6 6"
            stroke={stroke}
            strokeWidth={strokeW}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
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
      case 'nav-mark':
        return (
          <path
            d="M6 4h7l2 3v13l-4 2-4-2V4z"
            stroke={stroke}
            strokeWidth={strokeW}
            strokeLinejoin="round"
          />
        )
      case 'nav-archive':
        return (
          <>
            <path
              d="M4 8h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V8z"
              stroke={stroke}
              strokeWidth={strokeW}
              strokeLinejoin="round"
            />
            <path
              d="M5 8V6a1 1 0 011-1h12a1 1 0 011 1v2M9 8H5"
              stroke={stroke}
              strokeWidth={strokeW}
              strokeLinecap="round"
            />
          </>
        )
      case 'nav-reviews':
        return (
          <>
            <path
              d="M6 4h7a2 2 0 012 2v2H6V4z"
              stroke={stroke}
              strokeWidth={strokeW}
              strokeLinejoin="round"
            />
            <path
              d="M6 8h12v4a1 1 0 01-1 1H7a1 1 0 01-1-1V8z"
              stroke={stroke}
              strokeWidth={strokeW}
              strokeLinejoin="round"
            />
            <path
              d="M8 18h8M4 20h16"
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
