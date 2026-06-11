"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { readDevImpersonationContributorIdFromBrowser } from "@/lib/auth/resolveEffectiveContributor";
import { getActiveWorkspaceId } from "@/lib/workspace/activeWorkspace";
import {
  normalizeWorkspacePermission,
  type WorkspacePermissionLevel,
} from "@/lib/workspace/permissions";

const DEV_IMPERSONATION_STORAGE_KEY = "designtrace_dev_contributor_id";

const IMPERSONATION_NO_USER_ID_WARNING =
  "Impersonated contributor has no user_id — reading permission from contributors table directly";

type WorkspaceMemberPermissionRow = {
  permission_level?: string | null;
  role?: string | null;
};

type PermissionResolution = {
  permissionLevel: WorkspacePermissionLevel | null;
  userId: string | null;
};

function permissionFromWorkspaceMember(
  member: WorkspaceMemberPermissionRow | null,
): WorkspacePermissionLevel | null {
  if (!member) return null;

  const permissionLevel = member.permission_level?.trim();
  if (permissionLevel) {
    return normalizeWorkspacePermission(permissionLevel);
  }

  const memberRole = String(member.role ?? "").trim().toLowerCase();
  if (memberRole === "admin") return "admin";
  if (memberRole === "editor") return "editor";
  if (memberRole === "reviewer" || memberRole === "member") return "reviewer";

  return null;
}

async function fetchWorkspaceMemberPermission(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  workspaceId: string,
  userId: string,
): Promise<WorkspacePermissionLevel | null> {
  const { data: member, error } = await supabase
    .from("workspace_members")
    .select("permission_level, role")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    const { data: memberByRole } = await supabase
      .from("workspace_members")
      .select("role")
      .eq("workspace_id", workspaceId)
      .eq("user_id", userId)
      .maybeSingle();
    return permissionFromWorkspaceMember(
      (memberByRole as WorkspaceMemberPermissionRow | null) ?? null,
    );
  }

  return permissionFromWorkspaceMember(
    (member as WorkspaceMemberPermissionRow | null) ?? null,
  );
}

/**
 * Real users: workspace_members.permission_level (via auth user id).
 * Dev impersonation without user_id: contributors.permission_level only.
 */
async function resolveWorkspacePermission(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  workspaceId: string,
): Promise<PermissionResolution> {
  const impersonatedContributorId = readDevImpersonationContributorIdFromBrowser();

  if (impersonatedContributorId) {
    const { data: contributor } = await supabase
      .from("contributors")
      .select("user_id, permission_level")
      .eq("id", impersonatedContributorId)
      .maybeSingle();

    const row = contributor as { user_id?: string | null; permission_level?: string | null } | null;
    const linkedUserId = row?.user_id?.trim() || null;

    if (linkedUserId) {
      const level = await fetchWorkspaceMemberPermission(
        supabase,
        workspaceId,
        linkedUserId,
      );
      return { permissionLevel: level, userId: linkedUserId };
    }

    console.warn(IMPERSONATION_NO_USER_ID_WARNING);
    const contributorPermission = row?.permission_level?.trim();
    return {
      permissionLevel: contributorPermission
        ? normalizeWorkspacePermission(contributorPermission)
        : null,
      userId: null,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { permissionLevel: null, userId: null };
  }

  const level = await fetchWorkspaceMemberPermission(supabase, workspaceId, user.id);
  return { permissionLevel: level, userId: user.id };
}

export function useWorkspacePermission(workspaceId: string | null) {
  const [permissionLevel, setPermissionLevel] = useState<WorkspacePermissionLevel | null>(
    null,
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setPermissionLevel(null);
      setUserId(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { permissionLevel: level, userId: resolvedUserId } =
      await resolveWorkspacePermission(supabase, workspaceId);

    setUserId(resolvedUserId);
    setPermissionLevel(level);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      if (cancelled) return;
      await refresh();
    })();

    const supabase = createSupabaseBrowserClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      if (!cancelled) void refresh();
    });

    const onStorage = (event: StorageEvent) => {
      if (
        event.key === DEV_IMPERSONATION_STORAGE_KEY ||
        event.key === null
      ) {
        if (!cancelled) void refresh();
      }
    };

    window.addEventListener("storage", onStorage);

    return () => {
      cancelled = true;
      subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, [refresh]);

  return {
    permissionLevel,
    userId,
    loading,
    refresh,
  };
}

/** Resolves active workspace id then loads permission for the current user. */
export function useActiveWorkspacePermission() {
  const [workspaceId, setWorkspaceId] = useState<string | null>(null);

  const loadWorkspaceId = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const id = await getActiveWorkspaceId(supabase);
    setWorkspaceId(id);
  }, []);

  useEffect(() => {
    void loadWorkspaceId();

    const supabase = createSupabaseBrowserClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      void loadWorkspaceId();
    });

    const onStorage = (event: StorageEvent) => {
      if (
        event.key === DEV_IMPERSONATION_STORAGE_KEY ||
        event.key === null
      ) {
        void loadWorkspaceId();
      }
    };

    window.addEventListener("storage", onStorage);

    return () => {
      subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
    };
  }, [loadWorkspaceId]);

  return useWorkspacePermission(workspaceId);
}
