# DS Component Registry

Tracks every DLS component that has been extracted into code.
When a Figma component is updated, share the node URL → Claude diffs →
paste the update into the relevant file in `components/ui/ds/`.

DLS file key: `VytA96WG9bMQpx5n0yciGH`
Product file key: `GwelHmWvsDUPOXiqy5rVdE`

---

## Icon system

| Component | DLS Node  | Last synced | Notes |
|-----------|-----------|-------------|-------|
| Icon      | 166:2613  | 2026-04-19  | Inline SVG — no CDN URLs. To add/edit: share Figma node URL → Claude extracts SVG path → paste into ICONS map in Icon.tsx + add name to IconName union |

**Icon update workflow:**
1. Add or edit the icon in Figma (DLS file, node `166:2613`)
2. Tell Claude: "I've updated [icon-name] in Figma" or "I added a new icon called [name]"
3. Claude reads the updated node, writes the SVG path
4. Paste the new entry into `Icon.tsx` ICONS map and add the name to `IconName`
5. Run `npx tsc --noEmit` to confirm

---

## Atoms

| Component        | DLS Node  | Last synced | Notes |
|-----------------|-----------|-------------|-------|
| Button          | 98:1239   | 2026-04-16  | |
| Input           | 52:77     | 2026-04-16  | |
| Textarea        | 100:291   | 2026-04-16  | |
| Tag             | 99:389    | 2026-04-16  | |
| StatusPill      | 99:516    | 2026-04-16  | |
| Avatar          | 115:2031  | 2026-04-16  | |
| Tooltip         | 108:1128  | 2026-04-16  | |
| Checkbox        | 192:2214  | 2026-04-19  | |
| Divider         | 164:1822  | 2026-04-16  | |
| NotificationBadge | 115:4555 | 2026-04-16 | Product uses Dot/Success + Number/Brand only |

---

## Molecules

| Component        | DLS Node  | Last synced | Notes |
|-----------------|-----------|-------------|-------|
| ButtonGroup     | 108:1219  | 2026-04-16  | |
| TabItem         | 110:175   | 2026-04-16  | |
| ShowAccordion   | 145:2279  | 2026-04-16  | |
| ReviewCard      | 55:108    | 2026-04-19  | 5 status variants |
| DecisionCard    | 55:195    | 2026-04-19  | 4 status variants |
| TradeOffBlock   | 117:5554  | 2026-04-19  | Default + Variant2 |
| CommentThread   | 55:235    | 2026-04-19  | 5 type variants |
| ArtifactPreview | 238:6488  | 2026-04-19  | Large editable + readonly + Small |

---

## Organisms / Layout

| Component   | DLS Node  | Last synced | Notes |
|------------|-----------|-------------|-------|
| PageHeader | 56:99     | 2026-04-16  | 5 variants: default, detail, search, breadcrumbs, breadcrumb+tabs |
| Sidebar    | 120:1609  | 2026-04-16  | Hover-expand everywhere. No locked prop. |
| Modal      | 112:259   | 2026-04-16  | 4 types × 3 sizes |
| Drawer     | 112:338   | 2026-04-16  | |

---

## Not yet extracted

These DLS components have been identified but not yet turned into code:

| Component | DLS Node | Priority |
|-----------|----------|----------|
| Select    | 110:1553 | High — needed for Create Review drawer |
| Menu / MenuItem | TBD | High — needed for ButtonGroup dropdown |
| Alert / SentimentCard | 196:2303 | Medium |
| ProductCard | 123:2058 | Medium |

---

## Sync rules

- **Never** use Figma CDN asset URLs (`figma.com/api/mcp/asset/...`) in production code — they expire after 7 days
- **Always** use inline SVG via `<Icon name="..." />` for icons
- **Always** run `npx tsc --noEmit` and `grep -r "figma.com/api/mcp/asset"` after any component update
- When last-synced date is more than 4 weeks old, treat the component as potentially stale and re-read the Figma node before building with it
