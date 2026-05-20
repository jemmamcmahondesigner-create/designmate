"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  Avatar,
  Button,
  Checkbox,
  Icon,
  Input,
  Modal,
  Select,
} from "@/components/ui/ds";
import { useToast } from "@/components/Toast";
import { useActiveWorkspacePermission } from "@/hooks/useWorkspacePermission";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getActiveWorkspaceId } from "@/lib/workspace/activeWorkspace";
import { canAddTeammates } from "@/lib/workspace/permissions";
import { sendWorkspaceInvite } from "@/lib/workspace/invite-client";
import { inviteToastMessage } from "@/lib/workspace/invite-toast";
import { logTimelineEventClient } from "@/lib/timeline/logEventClient";
import type { ProjectContributor } from "@/types/project";

const sectionHeadingClass =
  "text-[20px] font-semibold leading-[1.3] text-[#6b1e2e]";
const sectionHeadingStyle = { letterSpacing: "-0.3px" as const };

type ContributorsSectionProps = {
  projectId: string;
  initialContributors: ProjectContributor[];
};

export function ContributorsSection({
  projectId,
  initialContributors,
}: ContributorsSectionProps) {
  const { showToast } = useToast();
  const { permissionLevel, loading: permissionLoading } = useActiveWorkspacePermission();
  const canManageTeammates = canAddTeammates(permissionLevel);
  const [contributors, setContributors] =
    useState<ProjectContributor[]>(initialContributors);
  const [allContributors, setAllContributors] =
    useState<ProjectContributor[]>(initialContributors);
  const [menuOpen, setMenuOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedContributorIds, setSelectedContributorIds] = useState<string[]>(
    []
  );
  const [contributorModalOpen, setContributorModalOpen] = useState(false);
  const [newContributorName, setNewContributorName] = useState("");
  const [newContributorEmail, setNewContributorEmail] = useState("");
  const [newContributorRole, setNewContributorRole] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [emailExistsError, setEmailExistsError] = useState<string | null>(null);
  const anchorRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    void (async () => {
      const activeWorkspaceId = await getActiveWorkspaceId(supabase);
      let query = supabase
        .from("contributors")
        .select("id, name, email, role")
        .order("created_at", { ascending: true });
      if (activeWorkspaceId) {
        query = query.eq("workspace_id", activeWorkspaceId);
      }
      const { data } = await query;
        if (!Array.isArray(data)) return;
        const mapped = data.map((row) => {
          const item = row as Record<string, unknown>;
          return {
            id: String(item.id ?? ""),
            name: String(item.name ?? ""),
            email:
              item.email == null || String(item.email).trim() === ""
                ? null
                : String(item.email),
            role:
              item.role == null || String(item.role).trim() === ""
                ? null
                : String(item.role),
            avatarUrl: null,
          } satisfies ProjectContributor;
        });
      setAllContributors(mapped);
    })();
  }, []);

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
    const { error } = await supabase.from("contributors").delete().eq("id", contributorId);
    if (!error) showToast("Changes saved");
  };

  return (
    <section className="flex flex-col gap-3">
      <h2 className={sectionHeadingClass} style={sectionHeadingStyle}>
        Teammates
      </h2>

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
            <div
              key={contributor.id}
              style={{
                height: 32,
                backgroundColor: "#f3efe9",
                border: "1px solid #e4ddd3",
                borderRadius: 4,
                paddingLeft: 8,
                paddingRight: 8,
                paddingTop: 4,
                paddingBottom: 4,
                gap: 8,
                display: "inline-flex",
                alignItems: "center",
              }}
            >
              <Avatar
                name={contributor.name}
                src={contributor.avatarUrl ?? undefined}
                size="md"
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
              <button
                type="button"
                onClick={() => void removeContributor(contributor.id)}
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
            </div>
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
        {canManageTeammates ? (
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

        {canManageTeammates && menuOpen && (
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
                  const alreadyOnProject = contributors.some(
                    (current) => current.id === contributor.id
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
                      <Avatar name={contributor.name} size="md" />
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
                    const toAdd = allContributors.filter((contributor) =>
                      selectedContributorIds.includes(contributor.id)
                    );
                    let added = false;
                    setContributors((prev) => {
                      const next = [
                        ...prev,
                        ...toAdd.filter(
                          (candidate) => !prev.some((existing) => existing.id === candidate.id)
                        ),
                      ];
                      added = next.length > prev.length;
                      return next;
                    });
                    setSelectedContributorIds([]);
                    setMenuOpen(false);
                    setSearch("");
                    if (added) showToast("Changes saved");
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

                if (email && activeWorkspaceId) {
                  const inviteResult = await sendWorkspaceInvite({
                    workspace_id: activeWorkspaceId,
                    email,
                    name,
                    role: newContributorRole.trim() || undefined,
                    permission_level: "reviewer",
                  });
                  if (inviteResult.status === "error") {
                    setIsSaving(false);
                    showToast(inviteToastMessage(inviteResult, name, email));
                    return;
                  }
                  showToast(inviteToastMessage(inviteResult, name, email));
                }

                const { data } = await supabase
                  .from("contributors")
                  .insert({
                    project_id: projectId,
                    workspace_id: activeWorkspaceId,
                    name,
                    email: email || null,
                    role: newContributorRole.trim() || null,
                  })
                  .select("id, name, email, role")
                  .single();
                setIsSaving(false);
                if (!data) return;
                const next: ProjectContributor = {
                  id: String((data as Record<string, unknown>).id ?? ""),
                  name: String((data as Record<string, unknown>).name ?? ""),
                  email:
                    ((data as Record<string, unknown>).email as
                      | string
                      | null
                      | undefined) ?? null,
                  role:
                    ((data as Record<string, unknown>).role as
                      | string
                      | null
                      | undefined) ?? null,
                };
                setAllContributors((prev) => [...prev, next]);
                setContributors((prev) => [...prev, next]);
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
        {!canManageTeammates && !permissionLoading ? (
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
      </Modal>
    </section>
  );
}

