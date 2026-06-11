"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Drawer, Input, Select, Textarea } from "@/components/ui/ds";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  completeProjectAction,
  reactivateProjectAction,
  saveProjectEditsAction,
  type SaveProjectEditsInput,
} from "@/app/projects/actions";
import { getProjectSaveToastMessage } from "@/lib/projects/projectSaveToastMessage";
import { CompleteProjectModal } from "@/components/project-detail/CompleteProjectModal";
import { ReactivateProjectModal } from "@/components/project-detail/ReactivateProjectModal";
import type { ProjectStatus } from "@/types/project";

type ClientOption = { id: string; name: string };

export type EditableProject = {
  id: string;
  name: string;
  description: string | null;
  clientId: string | null;
  clientName: string | null;
  status: ProjectStatus;
};

export type EditProjectDrawerProps = {
  open: boolean;
  onClose: () => void;
  project: EditableProject;
  onSaved?: (updated: EditableProject, toastMessage: string) => void;
};

const STATUS_OPTIONS: { value: ProjectStatus; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "complete", label: "Complete" },
];

export function EditProjectDrawer({
  open,
  onClose,
  project,
  onSaved,
}: EditProjectDrawerProps) {
  const router = useRouter();
  const descId = useId();

  const [name, setName] = useState("");
  const [clientId, setClientId] = useState("");
  const [clientOptions, setClientOptions] = useState<ClientOption[]>([]);
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<ProjectStatus>("active");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [completeModalOpen, setCompleteModalOpen] = useState(false);
  const [reactivateModalOpen, setReactivateModalOpen] = useState(false);

  const isReadOnly = project.status === "complete";

  const populateForm = useCallback((next: EditableProject) => {
    setName(next.name);
    setClientId(next.clientId ?? "");
    setDescription(next.description ?? "");
    setStatus(next.status);
    setError(null);
    setSubmitAttempted(false);
    setCompleteModalOpen(false);
    setReactivateModalOpen(false);
  }, []);

  useEffect(() => {
    if (!open) return;
    populateForm(project);
  }, [open, project, populateForm]);

  useEffect(() => {
    if (!open) return;
    const supabase = createSupabaseBrowserClient();
    void supabase
      .from("clients")
      .select("id, name")
      .order("name", { ascending: true })
      .then(({ data, error: clientsError }) => {
        if (clientsError) {
          console.error("EditProjectDrawer clients fetch error:", clientsError);
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
      });
  }, [open]);

  const baseline = useMemo(
    () => ({
      name: project.name.trim(),
      clientId: project.clientId ?? "",
      clientName: project.clientName?.trim() ?? "",
      description: project.description?.trim() ?? "",
      status: project.status,
    }),
    [project],
  );

  const isDirty = useMemo(
    () =>
      name.trim() !== baseline.name ||
      clientId !== baseline.clientId ||
      description.trim() !== baseline.description ||
      status !== baseline.status,
    [baseline, clientId, description, name, status],
  );

  const buildSaveInput = (): SaveProjectEditsInput => ({
    projectId: project.id,
    name: name.trim(),
    description: description.trim() || null,
    clientId: clientId || null,
    status,
    previous: {
      name: baseline.name,
      description: project.description,
      clientId: project.clientId,
      clientName: project.clientName,
      status: baseline.status,
    },
  });

  const resolveClientName = (nextClientId: string | null): string | null => {
    if (!nextClientId) return null;
    const match = clientOptions.find((opt) => opt.id === nextClientId);
    return match?.name ?? (baseline.clientName || null);
  };

  const finishSave = (
    nextStatus: ProjectStatus,
    nextClientId: string | null,
    toastMessage: string,
  ) => {
    const updated: EditableProject = {
      id: project.id,
      name: name.trim(),
      description: description.trim() || null,
      clientId: nextClientId,
      clientName: resolveClientName(nextClientId),
      status: nextStatus,
    };
    onSaved?.(updated, toastMessage);
    onClose();
    router.refresh();
  };

  const persistEdits = async (useCompleteFlow: boolean) => {
    setSubmitting(true);
    setError(null);

    const input = buildSaveInput();
    const result = useCompleteFlow
      ? await completeProjectAction(input)
      : await saveProjectEditsAction(input);

    setSubmitting(false);

    if (!result.success) {
      setError(result.message);
      return;
    }

    const nextStatus = useCompleteFlow ? "complete" : status;
    const toastMessage = getProjectSaveToastMessage({
      previousStatus: baseline.status,
      nextStatus,
    });

    finishSave(nextStatus, clientId || null, toastMessage);
  };

  const handleSave = async () => {
    if (submitting || !isDirty || isReadOnly) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setSubmitAttempted(true);
      return;
    }

    const transitioningToComplete =
      baseline.status !== "complete" && status === "complete";

    if (
      transitioningToComplete &&
      (baseline.status === "active" || baseline.status === "paused")
    ) {
      setCompleteModalOpen(true);
      return;
    }

    await persistEdits(transitioningToComplete);
  };

  const handleConfirmComplete = async () => {
    setCompleteModalOpen(false);
    await persistEdits(true);
  };

  const handleCloseCompleteModal = () => {
    setCompleteModalOpen(false);
  };

  const handleConfirmReactivate = async () => {
    setSubmitting(true);
    setError(null);
    const result = await reactivateProjectAction(project.id);
    setSubmitting(false);
    setReactivateModalOpen(false);

    if (!result.success) {
      setError(result.message);
      return;
    }

    onSaved?.(
      { ...project, status: "active" },
      getProjectSaveToastMessage({
        previousStatus: "complete",
        nextStatus: "active",
      }),
    );
    onClose();
    router.refresh();
  };

  const handleCloseReactivateModal = () => {
    setReactivateModalOpen(false);
  };

  const nameFieldError = submitAttempted && !name.trim();

  return (
    <>
      <Drawer
        open={open}
        type="edit"
        width={480}
        title="Edit project"
        showSubtitle={false}
        scrimVariant="brand"
        onClose={onClose}
        footer={
          isReadOnly ? (
            <>
              <span style={{ flex: "1 0 0" }} />
              <Button label="Cancel" variant="secondary" size="sm" onClick={onClose} />
              <Button
                label="Reactivate project"
                variant="secondary"
                size="sm"
                disabled={submitting}
                onClick={() => setReactivateModalOpen(true)}
              />
            </>
          ) : (
            <>
              <span
                style={{
                  flex: "1 0 0",
                  fontSize: 13,
                  fontWeight: 400,
                  color: "var(--text-secondary, #6b5e55)",
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}
              >
                Required*
              </span>
              <Button label="Cancel" variant="secondary" size="sm" onClick={onClose} />
              <Button
                label={submitting ? "Saving…" : "Save"}
                variant="primary"
                size="sm"
                disabled={!isDirty || submitting || !name.trim()}
                onClick={() => void handleSave()}
              />
            </>
          )
        }
        footerStyle={{ padding: "20px 24px 16px" }}
      >
        <div className="flex flex-col gap-6">
          {isReadOnly ? (
            <Alert
              sentiment="warning"
              prominence="low"
              title="This project is complete. Reactivate it to make changes."
              dismissible={false}
            />
          ) : null}

          <Input
            type="text"
            label="Project name"
            required
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="i.e. Website Redesign"
            autoComplete="off"
            size="sm"
            readOnly={isReadOnly}
            error={nameFieldError}
            errorMessage="Project name is required"
            helperText="Give your project a clear, descriptive name"
            showHelper={!nameFieldError}
          />

          <Select
            label="Project status"
            required
            options={STATUS_OPTIONS.map((opt) => ({ value: opt.value, label: opt.label }))}
            value={status}
            onChange={(v) => setStatus(v as ProjectStatus)}
            size="sm"
            portaled={true}
            readOnly={isReadOnly}
          />

          <Select
            label="Who is the project for?"
            options={clientOptions.map((opt) => ({ value: opt.id, label: opt.name }))}
            value={clientId || undefined}
            onChange={(v) => setClientId(v)}
            placeholder="Select a group"
            size="sm"
            portaled={true}
            readOnly={isReadOnly}
          />

          <Textarea
            id={descId}
            label="Project Description"
            showLabel
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="A brief overview of the project goals..."
            variant="form-fixed"
            size="sm"
            state={isReadOnly ? "read-only" : "default"}
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
      </Drawer>

      <CompleteProjectModal
        open={completeModalOpen}
        onClose={handleCloseCompleteModal}
        onConfirm={() => void handleConfirmComplete()}
      />

      <ReactivateProjectModal
        open={reactivateModalOpen}
        onClose={handleCloseReactivateModal}
        onConfirm={() => void handleConfirmReactivate()}
      />
    </>
  );
}
