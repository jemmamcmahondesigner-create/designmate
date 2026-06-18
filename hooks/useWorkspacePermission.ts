"use client";

import { useCallback, useEffect, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { readDevImpersonationContributorIdFromBrowser } from "@/lib/auth/resolveEffectiveContributor";
import { getActiveWorkspaceId } from "@/lib/workspace/activeWorkspace";
import {
  permissionFromWorkspaceMember,
  reviewerTypeFromWorkspaceMember,
  type WorkspaceMemberPermissionRow,
} from "@/lib/workspace/parseWorkspaceMember";
import type { ReviewerType, WorkspacePermissionLevel } from "@/lib/workspace/permissions";

const DEV_IMPERSONATION_STORAGE_KEY = "designtrace_dev_contributor_id";

type PermissionResolution = {
  workspacePermissionLevel: WorkspacePermissionLevel | null;
  reviewerType: ReviewerType | null;
  userId: string | null;
};

async function fetchWorkspaceMemberRow(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  workspaceId: string,
  userId: string,
): Promise<WorkspaceMemberPermissionRow | null> {
  const { data: members, error } = await supabase
    .from("workspace_members")
    .select("permission_level, role, reviewer_type")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1);

  const member = (members?.[0] as WorkspaceMemberPermissionRow | null) ?? null;

  if (!error) {
    return member;
  }

  const { data: membersByRole } = await supabase
    .from("workspace_members")
    .select("role, reviewer_type")
    .eq("workspace_id", workspaceId)
    .eq("user_id", userId)
    .eq("status", "active")
    .order("joined_at", { ascending: true })
    .limit(1);

  return (membersByRole?.[0] as WorkspaceMemberPermissionRow | null) ?? null;
}

/**
 * Real users: workspace_members.permission_level + reviewer_type (via auth user id).
 * Dev impersonation: resolve linked user_id → workspace_members (never project-scoped contributors).
 */
async function resolveWorkspacePermission(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  workspaceId: string,
): Promise<PermissionResolution> {
  const impersonatedContributorId = readDevImpersonationContributorIdFromBrowser();

  if (impersonatedContributorId) {
    const { data: contributor } = await supabase
      .from("contributors")
      .select("user_id")
      .eq("id", impersonatedContributorId)
      .maybeSingle();

    const row = contributor as { user_id?: string | null } | null;
    const linkedUserId = row?.user_id?.trim() || null;

    if (linkedUserId) {
      const member = await fetchWorkspaceMemberRow(
        supabase,
        workspaceId,
        linkedUserId,
      );
      const workspacePermissionLevel = permissionFromWorkspaceMember(member);
      return {
        workspacePermissionLevel,
        reviewerType: reviewerTypeFromWorkspaceMember(
          member,
          workspacePermissionLevel,
        ),
        userId: linkedUserId,
      };
    }

    return {
      workspacePermissionLevel: null,
      reviewerType: null,
      userId: null,
    };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      workspacePermissionLevel: null,
      reviewerType: null,
      userId: null,
    };
  }

  const member = await fetchWorkspaceMemberRow(supabase, workspaceId, user.id);
  const workspacePermissionLevel = permissionFromWorkspaceMember(member);

  return {
    workspacePermissionLevel,
    reviewerType: reviewerTypeFromWorkspaceMember(member, workspacePermissionLevel),
    userId: user.id,
  };
}

export function useWorkspacePermission(workspaceId: string | null) {
  const [workspacePermissionLevel, setWorkspacePermissionLevel] =
    useState<WorkspacePermissionLevel | null>(null);
  const [reviewerType, setReviewerType] = useState<ReviewerType | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [workspacePermissionLoading, setWorkspacePermissionLoading] =
    useState(true);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      setWorkspacePermissionLevel(null);
      setReviewerType(null);
      setUserId(null);
      setWorkspacePermissionLoading(false);
      return;
    }

    setWorkspacePermissionLoading(true);
    const supabase = createSupabaseBrowserClient();
    const {
      workspacePermissionLevel: level,
      reviewerType: resolvedReviewerType,
      userId: resolvedUserId,
    } = await resolveWorkspacePermission(supabase, workspaceId);

    setUserId(resolvedUserId);
    setWorkspacePermissionLevel(level);
    setReviewerType(resolvedReviewerType);
    setWorkspacePermissionLoading(false);
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
    workspacePermissionLevel,
    reviewerType,
    workspacePermissionLoading,
    userId,
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

