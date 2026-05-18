"use client";

import modalStyles from "@/components/ui/ds/Modal.module.css";
import { Modal } from "@/components/ui/ds";

export type DiscardChangesModalProps = {
  open: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
  /** Override dialog title */
  title?: string;
  /** Override body copy */
  message?: string;
  /** Override secondary (dismiss) action label */
  keepEditingLabel?: string;
  /** Override primary destructive action label */
  discardLabel?: string;
};

/**
 * Shared confirmation when closing a dirty form (Create Project / Create Review / nav).
 */
export function DiscardChangesModal({
  open,
  onKeepEditing,
  onDiscard,
  title = "Discard changes?",
  message = "You have unsaved changes that will be lost.",
  keepEditingLabel = "Keep editing",
  discardLabel = "Discard changes",
}: DiscardChangesModalProps) {
  return (
    <Modal
      open={open}
      type="default"
      size="sm"
      title={title}
      showSubtitle={false}
      backdropClosable={false}
      onClose={onKeepEditing}
      footer={
        <>
          <div className={modalStyles.spacer} />
          <button type="button" className={modalStyles.btnSecondary} onClick={onKeepEditing}>
            {keepEditingLabel}
          </button>
          <button type="button" className={modalStyles.btnDestructive} onClick={onDiscard}>
            {discardLabel}
          </button>
        </>
      }
    >
      <p className={modalStyles.description}>{message}</p>
    </Modal>
  );
}
