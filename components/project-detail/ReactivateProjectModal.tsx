"use client";

import { Modal } from "@/components/ui/ds";

export type ReactivateProjectModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function ReactivateProjectModal({
  open,
  onClose,
  onConfirm,
}: ReactivateProjectModalProps) {
  return (
    <Modal
      open={open}
      type="default"
      title="Reactivate this project?"
      description="This will reopen the project for editing. Child reviews will remain in their current states."
      onClose={onClose}
      confirmLabel="Reactivate"
      onConfirm={onConfirm}
    />
  );
}
