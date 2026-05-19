"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getActiveWorkspaceIdFromUser } from "@/lib/workspace/activeWorkspace";
import { Select } from "@/components/ui/ds";

const STORAGE_KEY = "designtrace_dev_contributor_id";

function isEnabled() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ENABLE_DEV_USER_SWITCHER === "true"
  );
}

type ContributorOption = {
  id: string;
  name: string;
  role: string | null;
};

type WorkspaceMembership = {
  workspaceId: string;
  workspaceName: string;
  memberRole: string;
};

export function DevUserSwitcher() {
  const enabled = isEnabled();
  const [options, setOptions] = useState<ContributorOption[]>([]);
  const [value, setValue] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [memberships, setMemberships] = useState<WorkspaceMembership[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>("");
  const [activeWorkspaceName, setActiveWorkspaceName] = useState<string | null>(null);
  const [activeMemberRole, setActiveMemberRole] = useState<string | null>(null);
  const [workspaceSaving, setWorkspaceSaving] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    const localValue =
      typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (localValue) setValue(localValue);

    const supabase = createSupabaseBrowserClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const currentWorkspaceId = getActiveWorkspaceIdFromUser(user) ?? "";

      const [{ data: contributorRows }, { data: membershipRows }] = await Promise.all([
        supabase
          .from("contributors")
          .select("id, name, role")
          .order("name", { ascending: true })
          .limit(100),
        supabase
          .from("workspace_members")
          .select("workspace_id, role, workspaces(id, name)")
          .eq("user_id", user.id),
      ]);

      const nextContributors = (contributorRows ?? []).map((row) => ({
        id: String((row as Record<string, unknown>).id ?? ""),
        name: String((row as Record<string, unknown>).name ?? ""),
        role:
          (row as Record<string, unknown>).role == null
            ? null
            : String((row as Record<string, unknown>).role),
      }));
      setOptions(nextContributors.filter((item) => item.id && item.name));

      const mappedMemberships: WorkspaceMembership[] = (membershipRows ?? [])
        .map((row) => {
          const item = row as Record<string, unknown>;
          const workspaces = item.workspaces as { id?: string; name?: string } | null;
          const workspaceId = String(item.workspace_id ?? workspaces?.id ?? "").trim();
          const workspaceName = String(workspaces?.name ?? workspaceId).trim();
          if (!workspaceId) return null;
          return {
            workspaceId,
            workspaceName: workspaceName || workspaceId,
            memberRole: String(item.role ?? "member"),
          };
        })
        .filter((item): item is WorkspaceMembership => item != null);

      setMemberships(mappedMemberships);

      const resolvedWorkspaceId =
        currentWorkspaceId ||
        mappedMemberships[0]?.workspaceId ||
        "";
      setActiveWorkspaceId(resolvedWorkspaceId);

      const activeMembership = mappedMemberships.find(
        (m) => m.workspaceId === resolvedWorkspaceId,
      );
      setActiveWorkspaceName(activeMembership?.workspaceName ?? null);
      setActiveMemberRole(activeMembership?.memberRole ?? null);
    })();
  }, [enabled]);

  const selectOptions = useMemo(
    () =>
      options.map((option) => ({
        value: option.id,
        label: option.role ? `${option.name} — ${option.role}` : option.name,
      })),
    [options],
  );

  const workspaceSelectOptions = useMemo(
    () =>
      memberships.map((membership) => ({
        value: membership.workspaceId,
        label: membership.workspaceName,
      })),
    [memberships],
  );

  if (!enabled) return null;

  const selectedStillExists = !value || options.some((item) => item.id === value);
  const selectedValue = selectedStillExists ? value : "";

  async function persistSelection(nextValue: string) {
    setSaving(true);
    try {
      if (!nextValue) {
        await fetch("/api/dev/impersonation", { method: "DELETE" });
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        await fetch("/api/dev/impersonation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contributorId: nextValue }),
        });
        window.localStorage.setItem(STORAGE_KEY, nextValue);
      }
      setValue(nextValue);
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  async function persistWorkspaceSelection(nextWorkspaceId: string) {
    setWorkspaceSaving(true);
    try {
      const supabase = createSupabaseBrowserClient();
      await supabase.auth.updateUser({
        data: { active_workspace_id: nextWorkspaceId },
      });
      setActiveWorkspaceId(nextWorkspaceId);
      const membership = memberships.find((m) => m.workspaceId === nextWorkspaceId);
      setActiveWorkspaceName(membership?.workspaceName ?? null);
      setActiveMemberRole(membership?.memberRole ?? null);
      window.location.reload();
    } finally {
      setWorkspaceSaving(false);
    }
  }

  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ fontSize: 11, color: "#6b5e55", marginBottom: 6 }}>Dev/Test only</div>
      {activeWorkspaceName ? (
        <p style={{ margin: "0 0 8px", fontSize: 11, lineHeight: 1.4, color: "#6b5e55" }}>
          <strong style={{ color: "#6b1e2e" }}>{activeWorkspaceName}</strong>
          {activeMemberRole ? ` · ${activeMemberRole}` : ""}
        </p>
      ) : null}
      <Select
        label="Impersonate contributor"
        size="sm"
        placeholder="Use real auth user"
        options={selectOptions}
        value={selectedValue || undefined}
        onChange={(nextValue) => void persistSelection(nextValue)}
        disabled={saving}
      />
      {memberships.length > 0 ? (
        <div style={{ marginTop: 8 }}>
          <Select
            label="Active workspace"
            size="sm"
            placeholder="Select workspace"
            options={workspaceSelectOptions}
            value={activeWorkspaceId || undefined}
            onChange={(nextValue) => void persistWorkspaceSelection(nextValue)}
            disabled={workspaceSaving}
          />
        </div>
      ) : null}
    </div>
  );
}
