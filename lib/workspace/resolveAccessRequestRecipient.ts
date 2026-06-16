import type { SupabaseClient } from "@supabase/supabase-js";

export type AccessRequestRecipient = {
  contributorId: string | null;
  name: string | null;
};

async function contributorNameById(
  supabase: SupabaseClient,
  contributorId: string,
): Promise<AccessRequestRecipient> {
  const { data } = await supabase
    .from("contributors")
    .select("id, name")
    .eq("id", contributorId)
    .maybeSingle();

  if (!data) {
    return { contributorId: null, name: null };
  }

  const row = data as Record<string, unknown>;
  const id = String(row.id ?? "").trim();
  const name = String(row.name ?? "").trim();
  if (!id) {
    return { contributorId: null, name: null };
  }
  return { contributorId: id, name: name || null };
}

async function resolveProjectCreatorContributor(
  supabase: SupabaseClient,
  projectId: string,
): Promise<AccessRequestRecipient> {
  const { data: createdEvent } = await supabase
    .from("timeline_events")
    .select("actor_id")
    .eq("project_id", projectId)
    .eq("event_type", "project_created")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  const actorId = String(
    (createdEvent as { actor_id?: string | null } | null)?.actor_id ?? "",
  ).trim();
  if (!actorId) {
    return { contributorId: null, name: null };
  }
  return contributorNameById(supabase, actorId);
}

async function resolveWorkspaceAdminContributor(
  supabase: SupabaseClient,
  workspaceId: string,
): Promise<AccessRequestRecipient> {
  const { data: adminMembers } = await supabase
    .from("workspace_members")
    .select("user_id, permission_level, role")
    .eq("workspace_id", workspaceId);

  const adminUserIds = (adminMembers ?? [])
    .map((row) => {
      const member = row as Record<string, unknown>;
      const permissionLevel = String(member.permission_level ?? "")
        .trim()
        .toLowerCase();
      const role = String(member.role ?? "").trim().toLowerCase();
      const isAdmin = permissionLevel === "admin" || role === "admin";
      const userId = String(member.user_id ?? "").trim();
      return isAdmin && userId ? userId : null;
    })
    .filter(Boolean) as string[];

  if (adminUserIds.length === 0) {
    return { contributorId: null, name: null };
  }

  const { data: adminContributors } = await supabase
    .from("contributors")
    .select("id, name, user_id")
    .eq("workspace_id", workspaceId)
    .in("user_id", adminUserIds)
    .order("created_at", { ascending: true });

  const first = (adminContributors ?? [])[0] as Record<string, unknown> | undefined;
  if (!first) {
    return { contributorId: null, name: null };
  }

  const id = String(first.id ?? "").trim();
  const name = String(first.name ?? "").trim();
  if (!id) {
    return { contributorId: null, name: null };
  }
  return { contributorId: id, name: name || null };
}

/**
 * Resolves who receives a project/review access request (stored at write-time).
 * Order: project creator (project_created actor) → workspace admin → null.
 */
export async function resolveAccessRequestRecipient(
  supabase: SupabaseClient,
  projectId: string,
  workspaceId: string,
): Promise<AccessRequestRecipient> {
  const creator = await resolveProjectCreatorContributor(supabase, projectId);
  if (creator.contributorId) {
    return creator;
  }

  return resolveWorkspaceAdminContributor(supabase, workspaceId);
}
