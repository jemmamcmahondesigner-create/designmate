"use client";



import { useCallback, useEffect, useState } from "react";

import { SpinnerIcon } from "@/components/auth/SpinnerIcon";

import { Button, Modal } from "@/components/ui/ds";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

import styles from "./WorkspaceSwitchConfirmModal.module.css";



export type WorkspaceSwitchConfirmKind = "created" | "joined";



export type WorkspaceSwitchConfirmProps = {

  open: boolean;

  workspaceId: string;

  workspaceName: string;

  kind: WorkspaceSwitchConfirmKind;

  onStay: () => void;

  onError?: (message: string) => void;

};



function titleForKind(kind: WorkspaceSwitchConfirmKind): string {

  if (kind === "joined") return "Joined workspace";

  return "Workspace Created";

}



function bodyForKind(kind: WorkspaceSwitchConfirmKind, workspaceName: string): string {

  const quoted = `"${workspaceName.trim()}"`;

  if (kind === "joined") {

    return `You've joined ${quoted}. Switch now or keep working in your current workspace?`;

  }

  return `Your new workspace ${quoted} is ready. Switch now or keep working in your current workspace?`;

}



const bodyStyle = {

  margin: 0,

  fontSize: 14,

  lineHeight: 1.5,

  color: "var(--text-secondary, #6b5e55)",

} as const;



export function WorkspaceSwitchConfirmModal({

  open,

  workspaceId,

  workspaceName,

  kind,

  onStay,

  onError,

}: WorkspaceSwitchConfirmProps) {

  const [isNavigating, setIsNavigating] = useState(false);



  useEffect(() => {

    if (!open) setIsNavigating(false);

  }, [open]);



  const handleGoToWorkspace = useCallback(async () => {

    if (!workspaceId || isNavigating) return;



    setIsNavigating(true);

    try {

      const supabase = createSupabaseBrowserClient();

      const { error } = await supabase.auth.updateUser({

        data: {

          active_workspace_id: workspaceId,

          workspace_id: workspaceId,

        },

      });



      if (error) {

        setIsNavigating(false);

        onError?.(error.message || "Couldn't switch workspace. Please try again.");

        return;

      }



      window.location.href = "/projects";

    } catch {

      setIsNavigating(false);

      onError?.("Couldn't switch workspace. Please try again.");

    }

  }, [isNavigating, onError, workspaceId]);



  const bodyCopy = bodyForKind(kind, workspaceName);



  return (

    <Modal

      open={open}

      type="form"

      size="sm"

      className={styles.modal}

      title={titleForKind(kind)}

      onClose={isNavigating ? () => undefined : onStay}

      backdropClosable={!isNavigating}

      footerNoPadding

      footer={

        <div

          style={{

            display: "flex",

            justifyContent: "flex-end",

            gap: 8,

            width: "100%",

            padding: "0 24px 16px",

            boxSizing: "border-box",

          }}

        >

          <Button

            label="Stay here"

            variant="secondary"

            size="sm"

            onClick={onStay}

            disabled={isNavigating}

          />

          <Button

            label={isNavigating ? "Switching..." : "Go to workspace"}

            variant="primary"

            size="sm"

            icon={isNavigating ? "none" : "trailing"}

            iconName="chevron-right"

            onClick={() => void handleGoToWorkspace()}

            disabled={isNavigating}

            trailingContent={

              isNavigating ? <SpinnerIcon size={14} className="animate-spin" /> : undefined

            }

          />

        </div>

      }

    >

      <p style={bodyStyle}>{bodyCopy}</p>

    </Modal>

  );

}

