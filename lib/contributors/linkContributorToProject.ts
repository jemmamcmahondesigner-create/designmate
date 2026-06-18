import type { SupabaseClient } from "@supabase/supabase-js";

export type LinkedProjectContributor = {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  userId?: string | null;
};

type LinkContributorInput = {
  projectId: string;
  workspaceId: string | null;
  contributorId?: string | null;
  userId?: string | null;
  name: string;
  email?: string | null;
  role?: string | null;
  permissionLevel?: string | null;
  isPaid?: boolean;
};

const CONTRIBUTOR_LINK_SELECT = "id, name, email, role, user_id, project_id";

function mapContributorRow(row: Record<string, unknown>): LinkedProjectContributor {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    email: (row.email as string | null | undefined) ?? null,
    role: (row.role as string | null | undefined) ?? null,
    userId:
      row.user_id == null || String(row.user_id).trim() === ""
        ? null
        : String(row.user_id),
  };
}

async function findProjectContributorByUserId(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
): Promise<LinkedProjectContributor | null> {
  const { data } = await supabase
    .from("contributors")
    .select(CONTRIBUTOR_LINK_SELECT)
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return data ? mapContributorRow(data as Record<string, unknown>) : null;
}

async function findWorkspaceContributorByUserId(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const { data } = await supabase
    .from("contributors")
    .select(CONTRIBUTOR_LINK_SELECT)
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .is("project_id", null)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (data as Record<string, unknown> | null) ?? null;
}

async function findAnyContributorForUserWorkspace(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<Record<string, unknown> | null> {
  const workspaceProfile = await findWorkspaceContributorByUserId(
    supabase,
    workspaceId,
    userId,
  );
  if (workspaceProfile) return workspaceProfile;

  const { data } = await supabase
    .from("contributors")
    .select(CONTRIBUTOR_LINK_SELECT)
    .eq("user_id", userId)
    .eq("workspace_id", workspaceId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  return (data as Record<string, unknown> | null) ?? null;
}

async function loadContributorSeed(
  supabase: SupabaseClient,
  contributorId: string,
  workspaceId: string | null,
): Promise<Record<string, unknown> | null> {
  let query = supabase
    .from("contributors")
    .select(
      "id, name, email, role, user_id, permission_level, is_paid, project_id, workspace_id",
    )
    .eq("id", contributorId);

  if (workspaceId) {
    query = query.eq("workspace_id", workspaceId);
  }

  const { data } = await query.maybeSingle();
  return (data as Record<string, unknown> | null) ?? null;
}

async function deleteLegacyProjectDuplicates(
  supabase: SupabaseClient,
  projectId: string,
  userId: string,
  canonicalId: string,
): Promise<void> {
  await supabase
    .from("contributors")
    .delete()
    .eq("user_id", userId)
    .eq("project_id", projectId)
    .neq("id", canonicalId);
}

async function linkExistingWorkspaceContributor(
  supabase: SupabaseClient,
  projectId: string,
  workspaceId: string,
  userId: string,
  existingRow: Record<string, unknown>,
): Promise<LinkedProjectContributor | null> {
  const canonicalId = String(existingRow.id ?? "").trim();
  if (!canonicalId) return null;

  const currentProjectId =
    existingRow.project_id == null ? null : String(existingRow.project_id).trim();

  if (currentProjectId === projectId) {
    return mapContributorRow(existingRow);
  }

  const legacyProjectRow = await findProjectContributorByUserId(
    supabase,
    projectId,
    userId,
  );
  if (legacyProjectRow && legacyProjectRow.id !== canonicalId) {
    await deleteLegacyProjectDuplicates(
      supabase,
      projectId,
      userId,
      canonicalId,
    );
  }

  const { data, error } = await supabase
    .from("contributors")
    .update({ project_id: projectId })
    .eq("id", canonicalId)
    .select(CONTRIBUTOR_LINK_SELECT)
    .single();

  if (error || !data) {
    console.error(
      "[linkContributorToProject] failed to link workspace contributor:",
      error?.message ?? "unknown error",
    );
    return null;
  }

  return mapContributorRow(data as Record<string, unknown>);
}

/** Link a workspace member to a project, reusing the workspace contributor row. */
export async function linkContributorToProject(
  supabase: SupabaseClient,
  input: LinkContributorInput,
): Promise<LinkedProjectContributor | null> {
  const projectId = input.projectId.trim();
  if (!projectId) return null;

  const workspaceId = input.workspaceId?.trim() || null;
  const name = input.name.trim();
  if (!name) return null;

  let resolvedUserId = input.userId?.trim() || null;
  let seedRow: Record<string, unknown> | null = null;

  if (input.contributorId?.trim()) {
    seedRow = await loadContributorSeed(
      supabase,
      input.contributorId.trim(),
      workspaceId,
    );
    if (!resolvedUserId && seedRow?.user_id != null) {
      resolvedUserId = String(seedRow.user_id).trim() || null;
    }
  }

  if (resolvedUserId && workspaceId) {
    const existingWorkspace = await findAnyContributorForUserWorkspace(
      supabase,
      workspaceId,
      resolvedUserId,
    );

    if (!existingWorkspace) {
      console.error(
        "[linkContributorToProject] no workspace contributor row found for user",
        { userId: resolvedUserId, workspaceId },
      );
      return null;
    }

    return linkExistingWorkspaceContributor(
      supabase,
      projectId,
      workspaceId,
      resolvedUserId,
      existingWorkspace,
    );
  }

  if (workspaceId && input.email?.trim()) {
    const normalizedEmail = input.email.trim().toLowerCase();
    const { data: workspaceProfile } = await supabase
      .from("contributors")
      .select(CONTRIBUTOR_LINK_SELECT)
      .eq("workspace_id", workspaceId)
      .ilike("email", normalizedEmail)
      .is("project_id", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (workspaceProfile) {
      const profile = workspaceProfile as Record<string, unknown>;
      const profileUserId = String(profile.user_id ?? "").trim() || null;
      if (profileUserId) {
        return linkExistingWorkspaceContributor(
          supabase,
          projectId,
          workspaceId,
          profileUserId,
          profile,
        );
      }
    }
  }

  if (workspaceId && resolvedUserId) {
    const existing = await findAnyContributorForUserWorkspace(
      supabase,
      workspaceId,
      resolvedUserId,
    );
    if (existing) {
      console.error(
        "[linkContributorToProject] contributor already exists for user/workspace; refusing insert",
        { userId: resolvedUserId, workspaceId },
      );
      return null;
    }
  }

  const { data, error } = await supabase
    .from("contributors")
    .insert({
      project_id: projectId,
      workspace_id: workspaceId,
      user_id: resolvedUserId,
      name,
      email: input.email?.trim() || null,
      role: input.role?.trim() || null,
      permission_level: input.permissionLevel ?? "reviewer",
      is_paid: input.isPaid ?? false,
    })
    .select(CONTRIBUTOR_LINK_SELECT)
    .single();

  if (error || !data) return null;
  return mapContributorRow(data as Record<string, unknown>);
}

/** Detach from project without deleting the workspace-profile contributor row. */
export async function unlinkContributorFromProject(
  supabase: SupabaseClient,
  contributorId: string,
): Promise<void> {
  const id = contributorId.trim();
  if (!id) return;

  const { data } = await supabase
    .from("contributors")
    .select("workspace_id, user_id, project_id")
    .eq("id", id)
    .maybeSingle();

  const row = data as {
    workspace_id?: string | null;
    user_id?: string | null;
    project_id?: string | null;
  } | null;

  const workspaceId = String(row?.workspace_id ?? "").trim();
  const userId = String(row?.user_id ?? "").trim();
  const projectId = row?.project_id == null ? null : String(row.project_id).trim();

  if (workspaceId && userId) {
    const workspaceProfile =
      (await findWorkspaceContributorByUserId(supabase, workspaceId, userId)) ??
      (row as Record<string, unknown> | null);

    const canonicalId = String(workspaceProfile?.id ?? id).trim();
    if (!canonicalId) return;

    if (projectId) {
      await deleteLegacyProjectDuplicates(
        supabase,
        projectId,
        userId,
        canonicalId,
      );
    }

    await supabase
      .from("contributors")
      .update({ project_id: null })
      .eq("id", canonicalId);
    return;
  }

  if (workspaceId) {
    await supabase.from("contributors").update({ project_id: null }).eq("id", id);
    return;
  }

  await supabase.from("contributors").delete().eq("id", id);
}
