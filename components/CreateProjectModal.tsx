"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DiscardChangesModal } from "@/components/DiscardChangesModal";
import { Alert, Button, Input, Modal, Select, Textarea, Tooltip } from "@/components/ui/ds";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ProjectClientFields } from "@/lib/projects/resolveProjectClientFields";
import { resolveProjectClientFields } from "@/lib/projects/resolveProjectClientFields";
import { getActiveWorkspaceId } from "@/lib/workspace/activeWorkspace";
import { logTimelineEventClient } from "@/lib/timeline/logEventClient";
import { linkContributorToProject } from "@/lib/contributors/linkContributorToProject";

type ClientOption = { id: string; name: string };

const CLIENT_CREATE_PREFIX = "__create__:";

export type CreateProjectModalProps = {
  open: boolean;
  onClose: () => void;
};

function decodeCreatableClientValue(
  value: string,
): { kind: "existing"; id: string } | { kind: "new"; name: string } | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith(CLIENT_CREATE_PREFIX)) {
    const name = decodeURIComponent(trimmed.slice(CLIENT_CREATE_PREFIX.length)).trim();
    return name ? { kind: "new", name } : null;
  }
  return { kind: "existing", id: trimmed };
}

async function resolveClientForProject(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  activeWorkspaceId: string,
  clientValue: string,
  clientOptions: ClientOption[],
): Promise<ProjectClientFields> {
  const parsed = decodeCreatableClientValue(clientValue);
  if (!parsed) return { client: null, client_id: null };

  if (parsed.kind === "existing") {
    return resolveProjectClientFields(supabase, {
      clientId: parsed.id,
      workspaceId: activeWorkspaceId,
    });
  }

  const existing = clientOptions.find(
    (option) => option.name.trim().toLowerCase() === parsed.name.toLowerCase(),
  );
  if (existing) {
    return resolveProjectClientFields(supabase, {
      clientId: existing.id,
      workspaceId: activeWorkspaceId,
    });
  }

  const { data: newClient, error } = await supabase
    .from("clients")
    .insert({ name: parsed.name, workspace_id: activeWorkspaceId })
    .select("id, name")
    .single();

  if (error || !newClient) {
    throw new Error(error?.message || "Could not create group.");
  }

  const row = newClient as Record<string, unknown>;
  return {
    client: String(row.name ?? parsed.name).trim() || parsed.name,
    client_id: String(row.id ?? "").trim() || null,
  };
}

export function CreateProjectModal({ open, onClose }: CreateProjectModalProps) {
  const router = useRouter();
  const descId = useId();
  const [name, setName] = useState("");
  const [clientValue, setClientValue] = useState("");
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const resetForm = useCallback(() => {
    setName("");
    setClientValue("");
    setDescription("");
    setError(null);
    setSubmitAttempted(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    const supabase = createSupabaseBrowserClient();
    void (async () => {
      const activeWorkspaceId = await getActiveWorkspaceId(supabase);
      if (!activeWorkspaceId) {
        setClientOptions([]);
        return;
      }

      const { data, error: clientsError } = await supabase
        .from("clients")
        .select("id, name")
        .eq("workspace_id", activeWorkspaceId)
        .order("name", { ascending: true });

      if (clientsError) {
        console.error("CreateProjectModal clients fetch error:", clientsError);
        return;
      }

      const mapped =
        data
          ?.map((row) => {
            const o = row as Record<string, unknown>;
            const id = String(o.id ?? "").trim();
            const label = String(o.name ?? "").trim();
            if (!id || !label) return null;
            return { id, name: label };
          })
          .filter((row): row is ClientOption => row != null) ?? [];
      setClientOptions(mapped);
    })();
  }, [open]);

  useEffect(() => {
    if (!open) {
      resetForm();
      setDiscardOpen(false);
    }
  }, [open, resetForm]);

  const isDirty = useMemo(
    () => name.trim() !== "" || clientValue.trim() !== "" || description.trim() !== "",
    [name, clientValue, description],
  );

  function requestClose() {
    if (isDirty) setDiscardOpen(true);
    else onClose();
  }

  const handleCreateProject = async () => {
    if (submitting) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setSubmitAttempted(true);
      return;
    }

    setSubmitting(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const activeWorkspaceId = await getActiveWorkspaceId(supabase);
    if (!activeWorkspaceId) {
      setError("Set up your workspace before creating a project.");
      setSubmitting(false);
      return;
    }

    let clientFields: ProjectClientFields;
    try {
      clientFields = await resolveClientForProject(
        supabase,
        activeWorkspaceId,
        clientValue,
        clientOptions,
      );
    } catch (clientError) {
      setError(clientError instanceof Error ? clientError.message : "Could not resolve group.");
      setSubmitting(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const authUserId = user?.id ?? null;

    const { data: createdProject, error: insertError } = await supabase
      .from("projects")
      .insert({
        name: trimmed,
        client: clientFields.client,
        client_id: clientFields.client_id,
        description: description.trim() || null,
        status: "active",
        workspace_id: activeWorkspaceId,
        created_by: authUserId,
      })
      .select("id, name")
      .single();

    if (!insertError && createdProject && authUserId) {
      const newProjectId = String(
        (createdProject as Record<string, unknown>).id ?? "",
      ).trim();

      if (newProjectId) {
        const { data: creatorContributor } = await supabase
          .from("contributors")
          .select("id, name, email, role, workspace_id")
          .eq("user_id", authUserId)
          .eq("workspace_id", activeWorkspaceId)
          .is("project_id", null)
          .maybeSingle();

        const creatorRow =
          creatorContributor ??
          (
            await supabase
              .from("contributors")
              .select("id, name, email, role, workspace_id")
              .eq("user_id", authUserId)
              .eq("workspace_id", activeWorkspaceId)
              .limit(1)
              .maybeSingle()
          ).data;

        if (creatorRow) {
          const row = creatorRow as Record<string, unknown>;
          const { data: existing } = await supabase
            .from("contributors")
            .select("id")
            .eq("user_id", authUserId)
            .eq("project_id", newProjectId)
            .maybeSingle();

          if (!existing) {
            await linkContributorToProject(supabase, {
              projectId: newProjectId,
              workspaceId: activeWorkspaceId,
              contributorId: String(row.id ?? ""),
              name: String(row.name ?? ""),
              email:
                row.email == null || String(row.email).trim() === ""
                  ? null
                  : String(row.email),
              role:
                row.role == null || String(row.role).trim() === ""
                  ? null
                  : String(row.role),
              permissionLevel: "admin",
              isPaid: false,
            });
          }
        }
      }
    }

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    const newProjectId = createdProject
      ? String((createdProject as Record<string, unknown>).id ?? "")
      : "";

    if (createdProject) {
      await logTimelineEventClient({
        projectId: newProjectId,
        eventType: "project_created",
        payload: {
          project_name: String((createdProject as Record<string, unknown>).name ?? trimmed),
        },
      });
    }

    resetForm();
    setDiscardOpen(false);
    onClose();
    if (newProjectId) {
      router.push(`/projects/${newProjectId}`);
    } else {
      router.refresh();
    }
  };

  const canSubmit = name.trim().length > 0 && !submitting;
  const nameFieldError = submitAttempted && !name.trim();

  const footer = (
    <>
      <span
        style={{
          flex: "1 0 0",
          fontSize: 13,
          color: "#6b5e55",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
      >
        Required*
      </span>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        label="Cancel"
        onClick={requestClose}
      />
      <div
        onPointerDownCapture={() => {
          if (!canSubmit) setSubmitAttempted(true);
        }}
        style={{ display: "inline-flex" }}
      >
        {canSubmit ? (
          <Button
            type="button"
            variant="accent"
            size="sm"
            label={submitting ? "Creating…" : "Create Project"}
            onClick={() => void handleCreateProject()}
          />
        ) : (
          <Tooltip label="Add a project name to continue">
            <span style={{ display: "inline-flex" }}>
              <Button
                type="button"
                variant="accent"
                size="sm"
                label={submitting ? "Creating…" : "Create Project"}
                disabled
                aria-disabled
              />
            </span>
          </Tooltip>
        )}
      </div>
    </>
  );

  return (
    <>
      <Modal
        open={open}
        type="form"
        size="md"
        title="Create Project"
        showSubtitle={false}
        onClose={requestClose}
        backdropClosable={!isDirty}
        onEscapeWhenBackdropBlocked={() => setDiscardOpen(true)}
        footer={footer}
      >
        <div className="flex flex-col gap-6">
          <Input
            type="text"
            label="Project name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="i.e. Website Redesign"
            autoComplete="off"
            size="sm"
            error={nameFieldError}
            errorMessage="Project name is required"
            helperText="Give your project a clear, descriptive name"
            showHelper={!nameFieldError}
          />

          <Select
            label="Who is the project for?"
            options={clientOptions.map((opt) => ({ value: opt.id, label: opt.name }))}
            value={clientValue || undefined}
            onChange={(value) => setClientValue(value)}
            placeholder="Type or select a group"
            size="sm"
            searchable
            creatable
            creatableOptionLabel={(typed) => `Use "${typed}"`}
            onCreatableSelect={(typed) =>
              `${CLIENT_CREATE_PREFIX}${encodeURIComponent(typed.trim())}`
            }
            portaled
          />

          <Textarea
            id={descId}
            label="Project Description"
            showLabel
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A brief overview of the project goals..."
            variant="form-fixed"
            size="md"
          />

          {error ? (
            <Alert
              sentiment="danger"
              prominence="low"
              title="Something went wrong"
              body={error}
              dismissible
              onDismiss={() => setError(null)}
            />
          ) : null}
        </div>
      </Modal>
      <DiscardChangesModal
        open={discardOpen}
        title="Unsaved changes?"
        message="You have unsaved changes. Are you sure you want to close?"
        keepEditingLabel="Keep editing"
        discardLabel="Discard changes"
        onKeepEditing={() => setDiscardOpen(false)}
        onDiscard={() => {
          resetForm();
          setDiscardOpen(false);
          onClose();
        }}
      />
    </>
  );
}
