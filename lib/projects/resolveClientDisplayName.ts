/**
 * Prefer live clients.name from a join; fall back to denormalized projects.client text.
 */
export function resolveClientDisplayName(
  clientText: string | null | undefined,
  clientsJoin: unknown,
): string | null {
  const joined = Array.isArray(clientsJoin) ? clientsJoin[0] : clientsJoin;
  if (joined && typeof joined === "object") {
    const name = String((joined as Record<string, unknown>).name ?? "").trim();
    if (name) return name;
  }

  const fallback = clientText?.trim();
  return fallback || null;
}
