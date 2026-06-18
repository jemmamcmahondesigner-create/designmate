"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Avatar,
  Button,
  Checkbox,
  Icon,
  Input,
  Modal,
  Select,
  Tag,
} from "@/components/ui/ds";
import { AccessRequestPendingPill } from "@/components/accessRequests/AccessRequestPendingPill";
import { useToast } from "@/components/Toast";
import { useActiveWorkspacePermission } from "@/hooks/useWorkspacePermission";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getActiveWorkspaceId } from "@/lib/workspace/activeWorkspace";
import {
  canAddTeammates,
  isPaidPermissionLevel,
  toStoredPermissionLevel,
  type ContentPermissionLevel,
} from "@/lib/workspace/permissions";
import { sendWorkspaceInvite } from "@/lib/workspace/invite-client";
import { inviteToastMessage } from "@/lib/workspace/invite-toast";
import { logTimelineEventClient } from "@/lib/timeline/logEventClient";
import { avatarColourKey, getAvatarInlineStyle } from "@/lib/utils/avatarColour";
import { approvePendingAccessRequestsClient } from "@/lib/accessRequests/approvePendingAccessRequests";
import {
  linkContributorToProject,
  unlinkContributorFromProject,
} from "@/lib/contributors/linkContributorToProject";
import type { ProjectContributor } from "@/types/project";

const sectionHeadingClass =
  "text-[20px] font-bold leading-[1.3] text-[#6b1e2e]";
const sectionHeadingStyle = { letterSpacing: "-0.3px" as const };

const TEAMMATE_PERMISSION_SELECT_OPTIONS = [
  { value: "reviewer", label: "Reviewer" },
  { value: "editor", label: "Editor" },
] as const;

type ContributorsSectionProps = {
  projectId: string;
  initialContributors: ProjectContributor[];
  hideAddActions?: boolean;
  pendingAccessRequestCount?: number;
  pendingAccessRequesterNames?: string[];
  onPendingAccessRequestsChanged?: () => void;
};

function contributorAvatarKey(contributor: ProjectContributor): string {
  return avatarColourKey(contributor.email, contributor.id, contributor.name);
}

function TeammateTag({
  contributor,
  editable,
  onRemove,
}: {
  contributor: ProjectContributor;
  editable: boolean;
  onRemove: (contributorId: string) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const showBrandHover = editable && hovered;

  return (
    <div
      className="group inline-flex items-center"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        height: 32,
        backgroundColor: showBrandHover ? "#f5eaec" : "#f3efe9",
        border: `1px solid ${showBrandHover ? "#e8d0d4" : "#e4ddd3"}`,
        borderRadius: 4,
        paddingLeft: 8,
        paddingRight: 8,
        paddingTop: 4,
        paddingBottom: 4,
        gap: 8,
        transition: "background-color 120ms ease, border-color 120ms ease",
      }}
    >
      <Avatar
        name={contributor.name}
        src={contributor.avatarUrl ?? undefined}
        contributorId={contributorAvatarKey(contributor)}
        size="md"
        prominence="high"
        style={getAvatarInlineStyle(contributorAvatarKey(contributor))}
      />
      <span style={{ fontSize: 13, fontWeight: 500, color: "#6b5e55" }}>
        {contributor.name}
      </span>
      {contributor.role ? (
        <span
          style={{
            fontSize: 13,
            fontWeight: 400,
            color: "#998c82",
            lineHeight: 1.65,
          }}
        >
          {contributor.role}
        </span>
      ) : null}
      {editable ? (
        <span className="inline-flex opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-within:opacity-100">
          <button
            type="button"
            onClick={() => onRemove(contributor.id)}
            aria-label={`Remove ${contributor.name}`}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "#998c82",
              display: "inline-flex",
              alignItems: "center",
              padding: 0,
            }}
          >
            <Icon name="close" size={14} />
          </button>
        </span>
      ) : null}
    </div>
  );
}

export function ContributorsSection({
  projectId,
  initialContributors,
  hideAddActions = false,
  pendingAccessRequestCount = 0,
  pendingAccessRequesterNames = [],
  onPendingAccessRequestsChanged,
}: ContributorsSectionProps) {
  const { showToast } = useToast();
  const {
    workspacePermissionLevel,
    workspacePermissionLoading,
  } = useActiveWorkspacePermission();
  const canManageTeammates = canAddTeammates(workspacePermissionLevel);
  const [contributors, setContributors] =
    useState<ProjectContributor[]>(initialContributors);
  const [allContributors, setAllContributors] = useState<ProjectContributor[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedContributorIds, setSelectedContributorIds] = useState<string[]>(
    []
  );
  const [contributorModalOpen, setContributorModalOpen] = useState(false);
  const [newContributorName, setNewContributorName] = useState("");
  const [newContributorEmail, setNewContributorEmail] = useState("");
  const [newContributorRole, setNewContributorRole] = useState("");
  const [newContributorPermissionLevel, setNewContributorPermissionLevel] =
    useState<ContentPermissionLevel>("reviewer");
  const [isSaving, setIsSaving] = useState(false);
  const [emailExistsError, setEmailExistsError] = useState<string | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setContributors(initialContributors);
  }, [initialContributors]);

  const loadSearchableContributors = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const activeWorkspaceId = await getActiveWorkspaceId(supabase);
    if (!activeWorkspaceId) {
      setAllContributors([]);
      return;
    }

    const alreadyAddedUserIds = new Set(
      contributors
        .map((contributor) => contributor.userId?.trim())
        .filter((userId): userId is string => Boolean(userId)),
    );

    const params = new URLSearchParams({ workspaceId: activeWorkspaceId });
    if (alreadyAddedUserIds.size > 0) {
      params.set("excludeUserIds", Array.from(alreadyAddedUserIds).join(","));
    }

    const response = await fetch(
      `/api/workspace/contributor-picker-options?${params.toString()}`,
    );
    if (!response.ok) {
      setAllContributors([]);
      return;
    }

    const payload = (await response.json()) as {
      options?: Array<{
        id: string;
        name: string;
        role: string;
        userId: string;
        email?: string | null;
      }>;
    };

    setAllContributors(
      (payload.options ?? []).map((option) => ({
        id: option.id,
        name: option.name,
        email: option.email?.trim() ? option.email.trim() : null,
        role: option.role.trim() ? option.role : null,
        userId: option.userId,
        avatarUrl: null,
      })),
    );
  }, [contributors]);

  useEffect(() => {
    void loadSearchableContributors();
  }, [loadSearchableContributors]);

  useEffect(() => {
    if (!menuOpen) return;
    void loadSearchableContributors();
  }, [menuOpen, loadSearchableContributors]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (!anchorRef.current?.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const availableContributors = useMemo(
    () =>
      allContributors.filter(
        (contributor) =>
          (search.trim() === "" ||
            contributor.name.toLowerCase().includes(search.toLowerCase()))
      ),
    [allContributors, search]
  );

  const closeCreateModal = () => {
    setContributorModalOpen(false);
    setNewContributorName("");
    setNewContributorEmail("");
    setNewContributorRole("");
    setNewContributorPermissionLevel("reviewer");
    setEmailExistsError(null);
  };

  useEffect(() => {
    if (!contributorModalOpen) return;
    const email = newContributorEmail.trim().toLowerCase();
    if (!email) {
      setEmailExistsError(null);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      const supabase = createSupabaseBrowserClient();
      void supabase
        .from("contributors")
        .select("id")
        .ilike("email", email)
        .limit(1)
        .then(({ data }) => {
          if (cancelled) return;
          setEmailExistsError(
            Array.isArray(data) && data.length > 0
              ? "A teammate with this email already exists."
              : null
          );
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [contributorModalOpen, newContributorEmail]);

  const removeContributor = async (contributorId: string) => {
    setContributors((prev) =>
      prev.filter((contributor) => contributor.id !== contributorId)
    );
    const supabase = createSupabaseBrowserClient();
    await unlinkContributorFromProject(supabase, contributorId);
    showToast("Changes saved");
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className={sectionHeadingClass} style={sectionHeadingStyle}>
          Teammates
        </h2>
        {canManageTeammates && pendingAccessRequestCount > 0 ? (
          <AccessRequestPendingPill
            count={pendingAccessRequestCount}
            requesterNames={pendingAccessRequesterNames}
          />
        ) : null}
      </div>

      {contributors.length === 0 && (
        <div
          style={{
            backgroundColor: "#f3efe9",
            border: "1px solid #e4ddd3",
            borderRadius: 8,
            height: 68,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 500, color: "#998c82" }}>
            Add teammates to collaborate on this project.
          </span>
        </div>
      )}

      {contributors.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
          {contributors.map((contributor) => (
            <TeammateTag
              key={contributor.id}
              contributor={contributor}
              editable={canManageTeammates}
              onRemove={(contributorId) => void removeContributor(contributorId)}
            />
          ))}
        </div>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          gap: 10,
          position: "relative",
        }}
        ref={anchorRef}
      >
        {canManageTeammates && !hideAddActions ? (
        <button
          type="button"
          onClick={() => setMenuOpen((prev) => !prev)}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            paddingLeft: 12,
            paddingRight: 12,
            paddingTop: 6,
            paddingBottom: 6,
            borderRadius: 6,
            border: "none",
            cursor: "pointer",
            fontSize: 13,
            fontWeight: 500,
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            backgroundColor: menuOpen ? "#f5eaec" : "transparent",
            color: "#6b1e2e",
            flexShrink: 0,
            transition: "background-color 120ms ease",
          }}
        >
          <Icon name="plus" size={14} />
          Add a contributor
        </button>
        ) : null}

        {canManageTeammates && !hideAddActions && menuOpen && (
          <div
            style={{
              flex: 1,
              minWidth: 0,
              maxWidth: 400,
              display: "flex",
              flexDirection: "column",
              gap: 6,
              position: "relative",
            }}
          >
            <div
              style={{
                position: "absolute",
                bottom: "100%",
                left: 0,
                width: 399,
                backgroundColor: "#ffffff",
                border: "1px solid #e4ddd3",
                borderRadius: 8,
                boxShadow:
                  "0px 2px 4px rgba(41,33,28,0.06), 0px 8px 16px rgba(41,33,28,0.15)",
                overflow: "hidden",
                zIndex: 50,
                paddingTop: 4,
                paddingBottom: 0,
                marginBottom: 4,
              }}
            >
              <div style={{ paddingBottom: 4 }}>
                {availableContributors.length === 0 && (
                  <div style={{ padding: "8px 12px", fontSize: 13, color: "#998c82" }}>
                    No teammates found.
                  </div>
                )}
                {availableContributors.map((contributor) => {
                  const pickerAvatarKey = contributorAvatarKey(contributor);
                  const alreadyOnProject = contributors.some(
                    (current) =>
                      (current.userId &&
                        contributor.userId &&
                        current.userId === contributor.userId) ||
                      current.id === contributor.id,
                  );
                  return (
                    <label
                      key={contributor.id}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "8px 12px",
                        cursor: alreadyOnProject ? "not-allowed" : "pointer",
                        width: "100%",
                        boxSizing: "border-box",
                        opacity: alreadyOnProject ? 0.6 : 1,
                      }}
                    >
                      <Checkbox
                        id={`contributor-${contributor.id}`}
                        label=""
                        checked={selectedContributorIds.includes(contributor.id)}
                        disabled={alreadyOnProject}
                        onChange={(checked) => {
                          if (alreadyOnProject) return;
                          setSelectedContributorIds((prev) =>
                            checked
                              ? [...prev, contributor.id]
                              : prev.filter((id) => id !== contributor.id)
                          );
                        }}
                      />
                      <Avatar
                        name={contributor.name}
                        contributorId={pickerAvatarKey}
                        size="md"
                        style={getAvatarInlineStyle(pickerAvatarKey)}
                      />
                      <span style={{ fontSize: 14, fontWeight: 500, color: "#2e1c1c", flex: 1 }}>
                        {contributor.name}
                      </span>
                      {alreadyOnProject ? (
                        <span style={{ fontSize: 12, color: "#998c82" }}>Already on project</span>
                      ) : null}
                    </label>
                  );
                })}
              </div>
              <div style={{ height: 1, backgroundColor: "#e4ddd3" }} />
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  padding: "8px 12px",
                }}
              >
                <Button
                  variant="primary"
                  size="sm"
                  label="Done"
                  onClick={() => {
                    void (async () => {
                      const toAdd = allContributors.filter((contributor) =>
                        selectedContributorIds.includes(contributor.id),
                      );
                      const supabase = createSupabaseBrowserClient();
                      const activeWorkspaceId = await getActiveWorkspaceId(supabase);
                      const approveContributorIds: string[] = [];
                      const addedContributors: ProjectContributor[] = [];

                      for (const contributor of toAdd) {
                        if (
                          contributors.some(
                            (existing) =>
                              (existing.userId &&
                                contributor.userId &&
                                existing.userId === contributor.userId) ||
                              existing.id === contributor.id,
                          )
                        ) {
                          continue;
                        }
                        const linked = await linkContributorToProject(supabase, {
                          projectId,
                          workspaceId: activeWorkspaceId,
                          contributorId: contributor.id,
                          userId: contributor.userId,
                          name: contributor.name,
                          email: contributor.email,
                          role: contributor.role,
                          permissionLevel: "reviewer",
                          isPaid: false,
                        });
                        if (!linked) continue;
                        approveContributorIds.push(linked.id);
                        addedContributors.push({
                          id: linked.id,
                          name: linked.name,
                          email: linked.email,
                          role: linked.role,
                          userId: linked.userId ?? contributor.userId ?? null,
                          avatarUrl: null,
                        });
                      }

                      if (addedContributors.length === 0) {
                        setSelectedContributorIds([]);
                        setMenuOpen(false);
                        setSearch("");
                        return;
                      }

                      setContributors((prev) => [
                        ...prev,
                        ...addedContributors.filter(
                          (candidate) =>
                            !prev.some((existing) => existing.id === candidate.id),
                        ),
                      ]);
                      await approvePendingAccessRequestsClient(supabase, {
                        contributorIds: approveContributorIds,
                        projectId,
                      });
                      onPendingAccessRequestsChanged?.();
                      setSelectedContributorIds([]);
                      setMenuOpen(false);
                      setSearch("");
                      showToast("Changes saved");
                    })();
                  }}
                />
                <button
                  type="button"
                  onClick={() => {
                    if (!canManageTeammates) return;
                    setMenuOpen(false);
                    setContributorModalOpen(true);
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    background: "none",
                    border: "none",
                    cursor: "pointer",
                    fontSize: 14,
                    fontWeight: 500,
                    color: "#6b1e2e",
                    fontFamily: "'Plus Jakarta Sans', sans-serif",
                  }}
                >
                  <Icon name="plus" size={16} />
                  Create a new teammate
                </button>
              </div>
            </div>

            <input
              type="text"
              placeholder="Find teammates"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              style={{
                height: 32,
                width: "100%",
                border: "1px solid #6b1e2e",
                borderRadius: 6,
                padding: "0 8px",
                fontSize: 13,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                color: "#2e1c1c",
                outline: "none",
                boxSizing: "border-box",
              }}
            />
          </div>
        )}
      </div>

      <Modal
        open={contributorModalOpen}
        type="form"
        size="md"
        title="Create a new teammate"
        onClose={closeCreateModal}
        footer={
          <div
            style={{
              display: "flex",
              alignItems: "center",
              width: "100%",
              gap: 8,
            }}
          >
            <div style={{ flex: 1, minWidth: 0 }} />
            <Button
              variant="secondary"
              size="sm"
              label="Cancel"
              onClick={closeCreateModal}
            />
            <Button
              variant="accent"
              size="sm"
              label="Create"
              disabled={
                !canManageTeammates ||
                !newContributorName.trim() ||
                isSaving ||
                Boolean(emailExistsError)
              }
              onClick={async () => {
                const name = newContributorName.trim();
                const email = newContributorEmail.trim();
                if (!name || isSaving || emailExistsError) return;
                if (!canManageTeammates) return;
                setIsSaving(true);
                const supabase = createSupabaseBrowserClient();
                const activeWorkspaceId = await getActiveWorkspaceId(supabase);

                const storedPermissionLevel = toStoredPermissionLevel(
                  newContributorPermissionLevel,
                  false,
                );

                if (email && activeWorkspaceId) {
                  const inviteResult = await sendWorkspaceInvite({
                    workspace_id: activeWorkspaceId,
                    email,
                    name,
                    role: newContributorRole.trim() || undefined,
                    permission_level: storedPermissionLevel,
                  });
                  if (inviteResult.status === "error") {
                    setIsSaving(false);
                    showToast(inviteToastMessage(inviteResult, name, email));
                    return;
                  }
                  showToast(inviteToastMessage(inviteResult, name, email));
                }

                const linked = await linkContributorToProject(supabase, {
                  projectId,
                  workspaceId: activeWorkspaceId,
                  name,
                  email: email || null,
                  role: newContributorRole.trim() || null,
                  permissionLevel: storedPermissionLevel,
                  isPaid: isPaidPermissionLevel(storedPermissionLevel),
                });
                setIsSaving(false);
                if (!linked) return;
                const next: ProjectContributor = {
                  id: linked.id,
                  name: linked.name,
                  email: linked.email,
                  role: linked.role,
                  userId: linked.userId ?? null,
                  avatarUrl: null,
                };
                setAllContributors((prev) => [...prev, next]);
                setContributors((prev) => [...prev, next]);
                await approvePendingAccessRequestsClient(supabase, {
                  contributorIds: [next.id],
                  projectId,
                });
                onPendingAccessRequestsChanged?.();
                await logTimelineEventClient({
                  projectId,
                  actorId: next.id,
                  eventType: "teammate_added",
                  payload: { teammate_name: next.name }
                });
                if (!email || !activeWorkspaceId) {
                  showToast("Changes saved");
                }
                closeCreateModal();
              }}
            />
          </div>
        }
      >
        {!canManageTeammates && !workspacePermissionLoading ? (
          <Alert
            sentiment="warning"
            prominence="low"
            title="Only editors and admins can add new teammates."
            dismissible={false}
          />
        ) : null}
        <Input
          label="Name"
          size="sm"
          placeholder="Full name"
          value={newContributorName}
          onChange={(e) => setNewContributorName(e.target.value)}
        />
        <Input
          label="Email Address"
          size="sm"
          type="email"
          placeholder="email@example.com"
          value={newContributorEmail}
          onChange={(e) => setNewContributorEmail(e.target.value)}
          error={Boolean(emailExistsError)}
          errorMessage={emailExistsError ?? undefined}
        />
        <Select
          label="Role"
          size="sm"
          portaled
          placeholder="Select"
          options={[
            { value: "Designer", label: "Designer" },
            { value: "Product Manager", label: "Product Manager" },
            { value: "Engineer", label: "Engineer" },
            { value: "Stakeholder", label: "Stakeholder" },
          ]}
          value={newContributorRole || undefined}
          onChange={(value) => setNewContributorRole(value)}
        />
        <Select
          label="Permission Level"
          size="sm"
          portaled
          placeholder="Select"
          options={[...TEAMMATE_PERMISSION_SELECT_OPTIONS]}
          value={newContributorPermissionLevel}
          onChange={(value) =>
            setNewContributorPermissionLevel(value as ContentPermissionLevel)
          }
        />
      </Modal>
    </section>
  );
}

