/** Deterministic avatar palette — hex literals so inline styles always resolve. */
const AVATAR_COLOURS = [
  { bg: '#f7eff2', text: '#7a2b3a' },
  { bg: '#ffecac', text: '#7a5500' },
  { bg: '#ebf6ee', text: '#256b38' },
  { bg: '#e5f3f9', text: '#1a527a' },
  { bg: '#f3efe9', text: '#5c524a' },
] as const;

export function getAvatarColour(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = id.charCodeAt(i) + ((hash << 5) - hash);
    hash = hash & hash;
  }
  const index = Math.abs(hash) % AVATAR_COLOURS.length;
  return AVATAR_COLOURS[index];
}

/** Inline avatar colours — background + paired initials text from the shared palette. */
export function getAvatarInlineStyle(
  id: string,
  options?: { ring?: boolean },
): { backgroundColor: string; color: string; boxShadow?: string } {
  const palette = getAvatarColour(id.trim() || "?");
  return {
    backgroundColor: palette.bg,
    color: palette.text,
    ...(options?.ring ? { boxShadow: "0 0 0 2px white" } : {}),
  };
}
