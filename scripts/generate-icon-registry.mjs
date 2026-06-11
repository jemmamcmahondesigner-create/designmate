/**
 * Reads public/icons/*.svg and prints a TS snippet for pasting into Icon.tsx
 * (or wire to file write). Run: node scripts/generate-icon-registry.mjs
 */
import fs from 'fs'
import path from 'path'

const outFile = path.join(
  process.cwd(),
  'components',
  'ui',
  'ds',
  'publicIconsRegistry.ts',
)
const dir = path.join(process.cwd(), 'public', 'icons')
const files = fs.readdirSync(dir).filter((f) => f.endsWith('.svg')).sort()

function normalizeSvgInner(inner) {
  let s = inner
  s = s.replace(/fill="#[0-9a-fA-F]{3,8}"/gi, 'fill="currentColor"')
  s = s.replace(/fill='#[0-9a-fA-F]{3,8}'/gi, 'fill="currentColor"')
  s = s.replace(/stroke="#[0-9a-fA-F]{3,8}"/gi, 'stroke="currentColor"')
  s = s.replace(/stroke='#[0-9a-fA-F]{3,8}'/gi, 'stroke="currentColor"')
  return s.trim()
}

const entries = []
for (const file of files) {
  const key = file.replace(/\.svg$/i, '')
  const raw = fs.readFileSync(path.join(dir, file), 'utf8')
  const vb = raw.match(/viewBox="([^"]+)"/)?.[1] ?? '0 0 24 24'
  const inner = raw
    .replace(/^[\s\S]*?<svg[^>]*>/, '')
    .replace(/<\/svg>\s*$/i, '')
  const innerHtml = normalizeSvgInner(inner)
  const escaped = innerHtml.replace(/\\/g, '\\\\').replace(/`/g, '\\`').replace(/\$\{/g, '\\${')
  entries.push(`  '${key}': {\n    viewBox: '${vb}',\n    innerHtml: \`${escaped}\`,\n  },`)
}

const banner = `/* eslint-disable */
/**
 * Auto-generated from public/icons/*.svg — run: node scripts/generate-icon-registry.mjs
 * Do not edit by hand; colours use currentColor in source strings.
 */
`
const body = `${banner}export const ICONS = {\n${entries.join('\n')}\n} as const\n\nexport type PublicIconKey = keyof typeof ICONS\n`
fs.writeFileSync(outFile, body, 'utf8')
