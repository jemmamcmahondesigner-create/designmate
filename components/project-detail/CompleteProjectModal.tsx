"use client";

import { Modal } from "@/components/ui/ds";

const BODY = (
  <div className="flex flex-col gap-3 text-sm leading-normal">
    <p className="m-0 text-[color:var(--text/secondary,#6b5e55)]">
      Completing this project will update all child reviews:
    </p>
    <ul className="list-disc space-y-1 pl-5 text-sm text-[color:var(--text/secondary,#6b5e55)]">
      <li>Reviews that are ready to complete will be marked complete.</li>
      <li>Reviews that are in-progress will be moved to draft.</li>
      <li>Paused reviews will remain paused.</li>
    </ul>
    <p className="m-0 text-[color:var(--text/secondary,#6b5e55)]">
      All project contributors will be notified by email.
    </p>
  </div>
);

export type CompleteProjectModalProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
};

export function CompleteProjectModal({
  open,
  onClose,
  onConfirm,
}: CompleteProjectModalProps) {
  return (
    <Modal
      open={open}
      type="default"
      title="Complete this project?"
      onClose={onClose}
      confirmLabel="Complete project"
      onConfirm={onConfirm}
    >
      {BODY}
    </Modal>
  );
}
