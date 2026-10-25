import type { SupabaseClient } from "@supabase/supabase-js";

export type AssignedContributorRow = {
  id: string;
  user_id?: string | null;
  email?: string | null;
  project_id?: string | null;
  workspace_id?: string | null;
};

export type AssignedReviewerPerson = {
  contributorId?: string | null;
  authUserId?: string | null;
  email?: string | null;
};

function normalizeEmail(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function rowInWorkspace(
  row: AssignedContributorRow,
  workspaceId: string,
): boolean {
  if (!workspaceId) return false;
  const rowWorkspaceId = String(row.workspace_id ?? "").trim();
  return !rowWorkspaceId || rowWorkspaceId === workspaceId;
}

function preferAssignedId(
  matches: string[],
  rowsById: Map<string, AssignedContributorRow>,
  exactId: string | null,
  projectId?: string | null,
): string | null {
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0] ?? null;

  console.warn(
    "[resolveAssignedReviewerId] multiple assigned ids match the same person",
    { matches, exactId, projectId },
  );

  if (exactId && matches.includes(exactId)) return exactId;

  const scopedProjectId = String(projectId ?? "").trim();
  if (scopedProjectId) {
    const projectScoped = matches.find((id) => {
      const row = rowsById.get(id);
      return String(row?.project_id ?? "").trim() === scopedProjectId;
    });
    if (projectScoped) return projectScoped;
  }

  return matches[0] ?? null;
}

/**
 * Returns the id from `assignedIds` that belongs to this person, or null.
 * Match order: exact contributor id, then same user_id in the same workspace,
 * then same email in the same workspace (only if the matched row has no
 * user_id or the same user_id).
 */
export function resolveAssignedReviewerIdFromRows(input: {
  assignedIds: string[];
  assignedRows: AssignedContributorRow[];
  person: AssignedReviewerPerson;
  workspaceId: string;
  projectId?: string | null;
}): string | null {
  const assignedIds = input.assignedIds.map((id) => String(id ?? "").trim()).filter(Boolean);
  if (assignedIds.length === 0) return null;

  const workspaceId = String(input.workspaceId ?? "").trim();
  const personId = String(input.person.contributorId ?? "").trim();
  const personUserId = String(input.person.authUserId ?? "").trim();
  const personEmail = normalizeEmail(input.person.email);

  const rowsById = new Map<string, AssignedContributorRow>();
  for (const row of input.assignedRows) {
    const id = String(row.id ?? "").trim();
    if (id) rowsById.set(id, row);
  }

  const exactId = personId && assignedIds.includes(personId) ? personId : null;
  if (!workspaceId) {
    return exactId;
  }

  const userIdMatches = assignedIds.filter((id) => {
    const row = rowsById.get(id);
    if (!row || !rowInWorkspace(row, workspaceId)) return false;
    const rowUserId = String(row.user_id ?? "").trim();
    return Boolean(personUserId && rowUserId && rowUserId === personUserId);
  });

  const emailMatches = assignedIds.filter((id) => {
    const row = rowsById.get(id);
    if (!row || !rowInWorkspace(row, workspaceId)) return false;
    const rowEmail = normalizeEmail(row.email);
    if (!personEmail || !rowEmail || rowEmail !== personEmail) return false;
    const rowUserId = String(row.user_id ?? "").trim();
    return !rowUserId || (Boolean(personUserId) && rowUserId === personUserId);
  });

  const matches = [...new Set([
    ...(exactId ? [exactId] : []),
    ...userIdMatches,
    ...emailMatches,
  ])];

  return preferAssignedId(matches, rowsById, exactId, input.projectId);
}

export function isDecisionMakerFromRows(input: {
  assignedIds: string[];
  assignedRows: AssignedContributorRow[];
  person: AssignedReviewerPerson;
  workspaceId: string;
  projectId?: string | null;
  decisionOwnerId?: string | null;
}): boolean {
  const assignedId = resolveAssignedReviewerIdFromRows(input);
  if (!assignedId) return false;
  const ownerId = String(input.decisionOwnerId ?? "").trim();
  if (!ownerId) return false;
  if (assignedId === ownerId) return true;
  return resolveAssignedReviewerIdFromRows({
    ...input,
    assignedIds: [ownerId],
  }) != null;
}

export function isSelfReviewerWrite(input: {
  requestedReviewerId?: string | null;
  currentContributorId: string;
  assignedReviewerId: string | null;
}): boolean {
  const requested = String(input.requestedReviewerId ?? "").trim();
  const currentId = String(input.currentContributorId ?? "").trim();
  if (!requested || requested === currentId) return true;
  const assignedId = String(input.assignedReviewerId ?? "").trim();
  return Boolean(assignedId && requested === assignedId);
}

async function loadAssignedContributorRows(
  supabase: SupabaseClient,
  assignedIds: string[],
  workspaceId: string,
): Promise<AssignedContributorRow[]> {
  if (assignedIds.length === 0) return [];
  let query = supabase
    .from("contributors")
    .select("id, user_id, email, project_id, workspace_id")
    .in("id", assignedIds);
  if (workspaceId) {
    query = query.eq("workspace_id", workspaceId);
  }
  const { data } = await query;
  return (data ?? []).map((row) => {
    const item = row as Record<string, unknown>;
    return {
      id: String(item.id ?? ""),
      user_id: item.user_id == null ? null : String(item.user_id),
      email: item.email == null ? null : String(item.email),
      project_id: item.project_id == null ? null : String(item.project_id),
      workspace_id: item.workspace_id == null ? null : String(item.workspace_id),
    };
  });
}

export async function resolveAssignedReviewerId(
  supabase: SupabaseClient,
  input: {
    assignedIds: string[];
    workspaceId: string;
    projectId?: string | null;
    person: AssignedReviewerPerson;
  },
): Promise<string | null> {
  const assignedIds = input.assignedIds.map((id) => String(id ?? "").trim()).filter(Boolean);
  const workspaceId = String(input.workspaceId ?? "").trim();
  const assignedRows = await loadAssignedContributorRows(
    supabase,
    assignedIds,
    workspaceId,
  );
  return resolveAssignedReviewerIdFromRows({
    assignedIds,
    assignedRows,
    person: input.person,
    workspaceId,
    projectId: input.projectId,
  });
}

export async function resolveAssignedReviewerIdForReview(
  supabase: SupabaseClient,
  input: {
    assignedIds: string[];
    projectId?: string | null;
    person: AssignedReviewerPerson;
  },
): Promise<string | null> {
  const projectId = String(input.projectId ?? "").trim();
  let workspaceId = "";
  if (projectId) {
    const { data } = await supabase
      .from("projects")
      .select("workspace_id")
      .eq("id", projectId)
      .maybeSingle();
    workspaceId = String(
      (data as { workspace_id?: string | null } | null)?.workspace_id ?? "",
    ).trim();
  }
  return resolveAssignedReviewerId(supabase, {
    assignedIds: input.assignedIds,
    workspaceId,
    projectId: projectId || null,
    person: input.person,
  });
}

export async function isDecisionMaker(
  supabase: SupabaseClient,
  input: {
    assignedIds: string[];
    projectId?: string | null;
    person: AssignedReviewerPerson;
    decisionOwnerId?: string | null;
  },
): Promise<boolean> {
  const assignedId = await resolveAssignedReviewerIdForReview(supabase, input);
  if (!assignedId) return false;
  const ownerId = String(input.decisionOwnerId ?? "").trim();
  if (!ownerId) return false;
  if (assignedId === ownerId) return true;
  const ownerMatch = await resolveAssignedReviewerIdForReview(supabase, {
    ...input,
    assignedIds: [ownerId],
  });
  return ownerMatch != null;
}

export async function listSamePersonContributorIdsInWorkspace(
  supabase: SupabaseClient,
  person: AssignedReviewerPerson,
  workspaceId: string,
): Promise<string[]> {
  const scopedWorkspaceId = String(workspaceId ?? "").trim();
  const personId = String(person.contributorId ?? "").trim();
  const personUserId = String(person.authUserId ?? "").trim();
  const personEmail = normalizeEmail(person.email);
  const ids = new Set<string>();
  if (personId) ids.add(personId);
  if (!scopedWorkspaceId) return [...ids];

  if (personUserId) {
    const { data } = await supabase
      .from("contributors")
      .select("id")
      .eq("workspace_id", scopedWorkspaceId)
      .eq("user_id", personUserId);
    for (const row of data ?? []) {
      const id = String((row as { id?: string }).id ?? "").trim();
      if (id) ids.add(id);
    }
  }

  if (personEmail) {
    const { data } = await supabase
      .from("contributors")
      .select("id, user_id")
      .eq("workspace_id", scopedWorkspaceId)
      .ilike("email", personEmail);
    for (const row of data ?? []) {
      const item = row as { id?: string; user_id?: string | null };
      const id = String(item.id ?? "").trim();
      const rowUserId = String(item.user_id ?? "").trim();
      if (!id) continue;
      if (!rowUserId || (personUserId && rowUserId === personUserId)) {
        ids.add(id);
      }
    }
  }

  return [...ids];
}
