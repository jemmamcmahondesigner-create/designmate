"use client";

import { useEffect, useState } from "react";
import { Button, Drawer, Input, Textarea } from "@/components/ui/ds";
import { updateReviewBasicsAction } from "./actions";

export type EditReviewDrawerProps = {
  open: boolean;
  onClose: () => void;
  reviewId: string;
  initialTitle: string;
  initialReviewFocus: string;
  onSaved?: () => void;
};

export function EditReviewDrawer({
  open,
  onClose,
  reviewId,
  initialTitle,
  initialReviewFocus,
  onSaved,
}: EditReviewDrawerProps) {
  const [title, setTitle] = useState(initialTitle);
  const [focus, setFocus] = useState(initialReviewFocus);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setTitle(initialTitle);
      setFocus(initialReviewFocus);
      setError(null);
    }
  }, [open, initialTitle, initialReviewFocus]);

  async function save() {
    if (saving) return;
    setSaving(true);
    setError(null);
    const result = await updateReviewBasicsAction({
      reviewId,
      title,
      reviewFocus: focus,
    });
    setSaving(false);
    if (!result.success) {
      setError(result.error ?? "Could not save.");
      return;
    }
    onSaved?.();
    onClose();
  }

  return (
    <Drawer
      open={open}
      type="edit"
      width={480}
      title="Edit review"
      subtitle="Update title and review focus"
      onClose={onClose}
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button type="button" variant="secondary" label="Cancel" size="sm" onClick={onClose} />
          <Button
            type="button"
            variant="primary"
            label={saving ? "Saving…" : "Save"}
            size="sm"
            disabled={saving || !title.trim()}
            onClick={() => void save()}
          />
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        {error ? (
          <p className="text-[13px] font-medium" style={{ color: "#8b2020" }}>
            {error}
          </p>
        ) : null}
        <Input
          type="text"
          label="Review title"
          required
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          size="sm"
        />
        <Textarea
          label="Review focus"
          showLabel
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          variant="form-fixed"
          size="md"
        />
      </div>
    </Drawer>
  );
}
