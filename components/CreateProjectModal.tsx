"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { DiscardChangesModal } from "@/components/DiscardChangesModal";
import { Alert, Button, Input, Modal, Select, Textarea, Tooltip } from "@/components/ui/ds";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { logTimelineEventClient } from "@/lib/timeline/logEventClient";

const CLIENT_OPTIONS = [
  "Internal Project",
  "Gem Designs and Signs",
  "Peak Digital Solutions",
  "Creative Canvas Marketing"
] as const;

export type CreateProjectModalProps = {
  open: boolean;
  onClose: () => void;
};

export function CreateProjectModal({ open, onClose }: CreateProjectModalProps) {
  const router = useRouter();
  const descId = useId();
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);

  const resetForm = useCallback(() => {
    setName("");
    setClient("");
    setDescription("");
    setError(null);
    setSubmitAttempted(false);
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
      setDiscardOpen(false);
    }
  }, [open, resetForm]);

  const isDirty = useMemo(
    () => name.trim() !== "" || client.trim() !== "" || description.trim() !== "",
    [name, client, description],
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
    const { data: createdProject, error: insertError } = await supabase
      .from("projects")
      .insert({
        name: trimmed,
        client: client.trim() || null,
        description: description.trim() || null,
        status: "active"
      })
      .select("id, name")
      .single();

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
          project_name: String((createdProject as Record<string, unknown>).name ?? trimmed)
        }
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
          fontFamily: "'Plus Jakarta Sans', sans-serif"
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
          options={CLIENT_OPTIONS.map((opt) => ({ value: opt, label: opt }))}
          value={client || undefined}
          onChange={(v) => setClient(v)}
          placeholder="Select a client"
          size="sm"
          portaled={true}
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
