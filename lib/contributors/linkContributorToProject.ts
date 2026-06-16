import type { SupabaseClient } from "@supabase/supabase-js";

export type LinkedProjectContributor = {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
};

type LinkContributorInput = {
  projectId: string;
  workspaceId: string | null;
  contributorId?: string | null;
  name: string;
  email?: string | null;
  role?: string | null;
  permissionLevel?: string | null;
  isPaid?: boolean;
};

function mapContributorRow(row: Record<string, unknown>): LinkedProjectContributor {
  return {
    id: String(row.id ?? ""),
    name: String(row.name ?? ""),
    email: (row.email as string | null | undefined) ?? null,
    role: (row.role as string | null | undefined) ?? null,
  };
}

async function resolveCanonicalWorkspaceContributorId(
  supabase: SupabaseClient,
  workspaceId: string,
  seed: { id: string; user_id?: string | null; email?: string | null },
): Promise<string> {
  const userId = String(seed.user_id ?? "").trim();
  if (userId) {
    const { data } = await supabase
      .from("contributors")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .is("project_id", null)
      .maybeSingle();
    const canonicalId = String((data as { id?: string } | null)?.id ?? "").trim();
    if (canonicalId) return canonicalId;
  }

  const email = String(seed.email ?? "").trim().toLowerCase();
  if (email) {
    const { data } = await supabase
      .from("contributors")
      .select("id")
      .eq("workspace_id", workspaceId)
      .ilike("email", email)
      .is("project_id", null)
      .maybeSingle();
    const canonicalId = String((data as { id?: string } | null)?.id ?? "").trim();
    if (canonicalId) return canonicalId;
  }

  return seed.id;
}

async function findWorkspaceContributorByEmail(
  supabase: SupabaseClient,
  workspaceId: string,
  email: string,
): Promise<string | null> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return null;

  console.log("[linkContributorToProject] findWorkspaceContributorByEmail BEFORE", {
    email: normalized,
    workspaceId,
  });

  const { data, error } = await supabase
    .from("contributors")
    .select("id")
    .eq("workspace_id", workspaceId)
    .ilike("email", normalized)
    .is("project_id", null)
    .maybeSingle();

  console.log("[linkContributorToProject] findWorkspaceContributorByEmail AFTER", {
    email: normalized,
    workspaceId,
    data,
    error,
  });

  const canonicalId = String((data as { id?: string } | null)?.id ?? "").trim();
  return canonicalId || null;
}

/** Reuse the workspace-scoped contributor row; set project_id instead of inserting a duplicate. */
export async function linkContributorToProject(
  supabase: SupabaseClient,
  input: LinkContributorInput,
): Promise<LinkedProjectContributor | null> {
  const projectId = input.projectId.trim();
  if (!projectId) return null;

  const workspaceId = input.workspaceId?.trim() || null;
  const name = input.name.trim();
  if (!name) return null;

  const updates: Record<string, unknown> = {
    project_id: projectId,
    name,
    role: input.role?.trim() || null,
  };
  if (input.permissionLevel) {
    updates.permission_level = input.permissionLevel;
    updates.is_paid = input.isPaid ?? false;
  }

  if (workspaceId) {
    let targetContributorId = input.contributorId?.trim() || null;

    if (!targetContributorId && input.email?.trim()) {
      targetContributorId = await findWorkspaceContributorByEmail(
        supabase,
        workspaceId,
        input.email,
      );
    }

    if (targetContributorId) {
      const { data: seed } = await supabase
        .from("contributors")
        .select("id, user_id, email")
        .eq("id", targetContributorId)
        .eq("workspace_id", workspaceId)
        .maybeSingle();

      if (seed) {
        const seedRow = seed as {
          id?: string;
          user_id?: string | null;
          email?: string | null;
        };
        const canonicalId = await resolveCanonicalWorkspaceContributorId(
          supabase,
          workspaceId,
          {
            id: String(seedRow.id ?? targetContributorId),
            user_id: seedRow.user_id,
            email: seedRow.email,
          },
        );

        const { data, error } = await supabase
          .from("contributors")
          .update(updates)
          .eq("id", canonicalId)
          .select("id, name, email, role")
          .single();

        if (!error && data) {
          return mapContributorRow(data as Record<string, unknown>);
        }
      }
    }

    let canonicalId: string | null = null;
    if (input.email?.trim()) {
      canonicalId = await findWorkspaceContributorByEmail(
        supabase,
        workspaceId,
        input.email,
      );
    }

    if (canonicalId) {
      const { data, error } = await supabase
        .from("contributors")
        .update(updates)
        .eq("id", canonicalId)
        .select("id, name, email, role")
        .single();

      if (!error && data) {
        return mapContributorRow(data as Record<string, unknown>);
      }
    }

    const fallbackInsertPayload = {
      workspace_id: workspaceId,
      project_id: null,
      name,
      email: input.email?.trim() || null,
      role: input.role?.trim() || null,
      permission_level: input.permissionLevel ?? "reviewer",
      is_paid: input.isPaid ?? false,
    };
    console.log("[linkContributorToProject] fallback insert BEFORE", fallbackInsertPayload);

    const { data: inserted, error: insertError } = await supabase
      .from("contributors")
      .insert(fallbackInsertPayload)
      .select("id, name, email, role")
      .single();

    if (insertError || !inserted) return null;

    const { data: linked, error: linkError } = await supabase
      .from("contributors")
      .update(updates)
      .eq("id", (inserted as { id: string }).id)
      .select("id, name, email, role")
      .single();

    if (!linkError && linked) {
      return mapContributorRow(linked as Record<string, unknown>);
    }
    return mapContributorRow(inserted as Record<string, unknown>);
  }

  const { data, error } = await supabase
    .from("contributors")
    .insert({
      project_id: projectId,
      workspace_id: workspaceId,
      name,
      email: input.email?.trim() || null,
      role: input.role?.trim() || null,
      permission_level: input.permissionLevel ?? "reviewer",
      is_paid: input.isPaid ?? false,
    })
    .select("id, name, email, role")
    .single();

  if (error || !data) return null;
  return mapContributorRow(data as Record<string, unknown>);
}

/** Detach from project without deleting the workspace-scoped contributor row. */
export async function unlinkContributorFromProject(
  supabase: SupabaseClient,
  contributorId: string,
): Promise<void> {
  const id = contributorId.trim();
  if (!id) return;

  const { data } = await supabase
    .from("contributors")
    .select("workspace_id")
    .eq("id", id)
    .maybeSingle();

  const workspaceId = String(
    (data as { workspace_id?: string | null } | null)?.workspace_id ?? "",
  ).trim();

  if (workspaceId) {
    await supabase.from("contributors").update({ project_id: null }).eq("id", id);
    return;
  }

  await supabase.from("contributors").delete().eq("id", id);
}
