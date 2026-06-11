import type { SupabaseClient } from "@supabase/supabase-js";

export type ResolvedContributor = {
  contributorId: string;
  name: string;
};

type ContributorRow = {
  id: string;
  name: string;
  user_id: string | null;
  workspace_id: string | null;
};

function pickCanonicalContributor(rows: ContributorRow[]): ContributorRow | null {
  if (rows.length === 0) return null;
  return (
    rows.find((row) => row.workspace_id != null && String(row.workspace_id).trim() !== "") ??
    rows[0]
  );
}

/**
 * Map any raw contributor reference (contributors.id, auth user_id, or
 * workspace_members.id) → canonical workspace contributors.id for avatars.
 */
export async function resolveCanonicalContributorIds(
  supabase: SupabaseClient,
  rawIds: readonly string[],
): Promise<Map<string, ResolvedContributor>> {
  const uniqueRaw = [...new Set(rawIds.map((id) => id.trim()).filter(Boolean))];
  const resolved = new Map<string, ResolvedContributor>();
  if (uniqueRaw.length === 0) return resolved;

  const contributorRows: ContributorRow[] = [];

  const { data: byContributorId } = await supabase
    .from("contributors")
    .select("id, name, user_id, workspace_id")
    .in("id", uniqueRaw);
  contributorRows.push(...((byContributorId ?? []) as ContributorRow[]));

  const unmatchedAfterId = uniqueRaw.filter(
    (rawId) => !contributorRows.some((row) => row.id === rawId),
  );
  if (unmatchedAfterId.length > 0) {
    const { data: byUserId } = await supabase
      .from("contributors")
      .select("id, name, user_id, workspace_id")
      .in("user_id", unmatchedAfterId);
    contributorRows.push(...((byUserId ?? []) as ContributorRow[]));
  }

  const stillUnmatched = uniqueRaw.filter((rawId) => {
    return !contributorRows.some(
      (row) => row.id === rawId || row.user_id === rawId,
    );
  });

  const memberUserIdByMemberId = new Map<string, string>();
  if (stillUnmatched.length > 0) {
    const { data: members } = await supabase
      .from("workspace_members")
      .select("id, user_id")
      .in("id", stillUnmatched);
    const memberUserIds = new Set<string>();
    for (const member of members ?? []) {
      const memberId = String((member as { id?: string }).id ?? "").trim();
      const userId = String((member as { user_id?: string }).user_id ?? "").trim();
      if (memberId && userId) {
        memberUserIdByMemberId.set(memberId, userId);
        memberUserIds.add(userId);
      }
    }
    if (memberUserIds.size > 0) {
      const { data: byMemberUser } = await supabase
        .from("contributors")
        .select("id, name, user_id, workspace_id")
        .in("user_id", [...memberUserIds]);
      contributorRows.push(...((byMemberUser ?? []) as ContributorRow[]));
    }
  }

  const dedupedById = new Map<string, ContributorRow>();
  for (const row of contributorRows) {
    const id = row.id.trim();
    if (id) dedupedById.set(id, row);
  }

  const linkedUserIds = new Set<string>();
  for (const rawId of uniqueRaw) {
    const memberUserId = memberUserIdByMemberId.get(rawId);
    if (memberUserId) linkedUserIds.add(memberUserId);
    for (const row of dedupedById.values()) {
      if (row.id === rawId || row.user_id?.trim() === rawId) {
        if (row.user_id?.trim()) linkedUserIds.add(row.user_id.trim());
      }
    }
  }

  if (linkedUserIds.size > 0) {
    const { data: allForUsers } = await supabase
      .from("contributors")
      .select("id, name, user_id, workspace_id")
      .in("user_id", [...linkedUserIds]);
    for (const row of (allForUsers ?? []) as ContributorRow[]) {
      const id = row.id.trim();
      if (id) dedupedById.set(id, row);
    }
  }

  const rowsByUserId = new Map<string, ContributorRow[]>();
  for (const row of dedupedById.values()) {
    const userId = row.user_id?.trim();
    if (!userId) continue;
    const bucket = rowsByUserId.get(userId) ?? [];
    bucket.push(row);
    rowsByUserId.set(userId, bucket);
  }

  for (const rawId of uniqueRaw) {
    const directRow = [...dedupedById.values()].find(
      (row) => row.id === rawId || row.user_id?.trim() === rawId,
    );
    const memberUserId = memberUserIdByMemberId.get(rawId);
    const userId = memberUserId ?? directRow?.user_id?.trim() ?? null;

    const candidates = userId
      ? (rowsByUserId.get(userId) ?? (directRow ? [directRow] : []))
      : directRow
        ? [directRow]
        : [];

    const canonical = pickCanonicalContributor(candidates);
    if (!canonical?.id.trim() || !canonical.name.trim()) continue;

    resolved.set(rawId, {
      contributorId: canonical.id.trim(),
      name: canonical.name.trim(),
    });
  }

  return resolved;
}
