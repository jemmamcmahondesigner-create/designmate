"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import {
  Alert,
  Button,
  Icon,
  IconSquareButton,
  Input,
  Menu,
  MenuItem,
  Modal,
  Tooltip,
} from "@/components/ui/ds";
import inputStyles from "@/components/ui/ds/Input.module.css";
import { CreatableRoleSelect } from "@/components/settings/CreatableRoleSelect";
import { getSiteOrigin } from "@/lib/auth/mapAuthError";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { WorkspaceSwitchConfirmModal } from "@/components/settings/WorkspaceSwitchConfirmModal";
import { ensureContributorProfile } from "@/lib/workspace/ensureContributorProfile";
import { ensureWorkspaceMember } from "@/lib/workspace/ensureWorkspaceMember";
import { resolveContributorRoleFields } from "@/lib/workspace/resolveContributorRoleFields";
import {
  duplicateOwnedWorkspaceMessage,
  normalizeWorkspaceNameKey,
  parseWorkspaceCreateError,
} from "@/lib/workspace/workspaceCreateErrors";
import { generateInviteCode } from "@/lib/workspace/utils";
import { getAvatarInlineStyle, avatarColourKey } from "@/lib/utils/avatarColour";

export type ProfileRoleOption = { id: string; name: string };

export type ProfileWorkspace = {
  id: string;
  name: string;
  memberRole: string;
  status: string;
  isOnlyAdmin: boolean;
};

export type ProfileContributor = {
  id: string;
  name: string;
  roleName: string | null;
};

type ProfilePageClientProps = {
  userId: string | null;
  email: string | null;
  activeWorkspaceId: string | null;
  contributor: ProfileContributor | null;
  roleOptions: ProfileRoleOption[];
  workspaces: ProfileWorkspace[];
};

const WORKSPACE_INVITE_BASE_URL = "https://app.designtrace.ai/join";

const pageStyle: CSSProperties = {
  maxWidth: 800,
  width: "100%",
  display: "flex",
  flexDirection: "column",
  gap: 32,
  paddingBottom: 32,
  background: "var(--surface-page, #faf8f6)",
};

const cardStyle: CSSProperties = {
  width: "100%",
  border: "1px solid var(--border-default, #e4ddd3)",
  borderRadius: 8,
  overflow: "hidden",
  boxSizing: "border-box",
};

const cardHeaderStyle: CSSProperties = {
  margin: 0,
  height: 44,
  boxSizing: "border-box",
  display: "flex",
  alignItems: "center",
  paddingLeft: 16,
  paddingRight: 16,
  fontSize: 14,
  fontWeight: 500,
  lineHeight: 1.4,
  color: "var(--text-secondary, #6b5e55)",
  background: "var(--surface-app-header, #ffffff)",
  borderBottom: "1px solid var(--border-default, #e4ddd3)",
};

const cardBodyStyle: CSSProperties = {
  padding: "24px 24px 32px",
  background: "var(--surface-page, #faf8f6)",
};

const workspacesCardBodyStyle: CSSProperties = {
  padding: "24px 24px 24px",
  background: "var(--surface-page, #faf8f6)",
};

const readOnlyFieldStyle: CSSProperties = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  alignItems: "center",
  gap: 8,
  height: 38,
  boxSizing: "border-box",
  padding: "0 12px",
  borderRadius: 6,
  border: "1px solid var(--border-default, #e4ddd3)",
  background: "var(--neutral-50, #faf8f6)",
  overflow: "hidden",
};

const workspaceCardStyle: CSSProperties = {
  width: "100%",
  boxSizing: "border-box",
  padding: 16,
  borderRadius: 8,
  border: "1px solid var(--border-default, #e4ddd3)",
  background: "var(--surface-card-default, #ffffff)",
};

function workspaceShortId(id: string): string {
  return id.trim().slice(0, 8);
}

function buildWorkspaceInviteLink(workspaceId: string): string {
  return `${WORKSPACE_INVITE_BASE_URL}/${workspaceShortId(workspaceId)}`;
}

function parseJoinLinkShortId(input: string): string | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  try {
    const url = new URL(trimmed.includes("://") ? trimmed : `https://app.designtrace.ai/${trimmed.replace(/^\//, "")}`);
    const segment = url.pathname.split("/").filter(Boolean).pop();
    if (segment) return segment.slice(0, 8).toLowerCase();
  } catch {
    // fall through to bare segment parsing
  }

  const lastSegment = trimmed.split("/").filter(Boolean).pop() ?? trimmed;
  return lastSegment.slice(0, 8).toLowerCase() || null;
}

function splitDisplayName(full: string): { firstName: string; lastName: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function combineDisplayName(firstName: string, lastName: string): string {
  return [firstName.trim(), lastName.trim()].filter(Boolean).join(" ");
}

function profileAvatarInitials(firstName: string, lastName: string): string {
  const first = firstName.trim()[0]?.toUpperCase() ?? "";
  const last = lastName.trim()[0]?.toUpperCase() ?? "";
  return `${first}${last}` || "?";
}

function workspaceNamePreviewId(name: string): string {
  const firstWord = name.trim().split(/\s+/)[0] ?? "";
  const prefix = firstWord.slice(0, 3).toUpperCase().padEnd(3, "X");
  return `${prefix}-1`;
}

const accentCardStyle: CSSProperties = {
  border: "1px solid var(--brand-accent-hover, #e5c820)",
  background: "var(--brand-accent-subtle, #fff6d7)",
};

const defaultOptionCardStyle: CSSProperties = {
  border: "1px solid var(--border-default, #e4ddd3)",
  background: "var(--surface-card-default, #ffffff)",
};

function ProfileErrorToast({
  message,
  onDone,
}: {
  message: string;
  onDone: () => void;
}) {
  const [opacity, setOpacity] = useState(0);
  const onDoneRef = useRef(onDone);
  onDoneRef.current = onDone;

  useEffect(() => {
    const outerRaf = requestAnimationFrame(() => {
      requestAnimationFrame(() => setOpacity(1));
    });
    const fade = window.setTimeout(() => setOpacity(0), 2700);
    const remove = window.setTimeout(() => onDoneRef.current(), 3000);
    return () => {
      cancelAnimationFrame(outerRaf);
      window.clearTimeout(fade);
      window.clearTimeout(remove);
    };
  }, []);

  if (typeof document === "undefined") return null;

  return createPortal(
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        zIndex: 1000,
        opacity,
        transition: "opacity 300ms ease",
        width: "min(360px, calc(100vw - 48px))",
      }}
    >
      <Alert
        sentiment="danger"
        prominence="low"
        title={message}
        dismissible={false}
        className="w-full shadow-[0_4px_12px_rgba(41,33,28,0.12)]"
      />
    </div>,
    document.body,
  );
}

type WorkspaceCardProps = {
  workspace: ProfileWorkspace;
  activeWorkspaceId: string | null;
  onRename: (workspaceId: string, nextName: string) => Promise<boolean>;
  onLeave: (workspaceId: string) => Promise<boolean>;
  onToastSuccess: () => void;
  onToastError: () => void;
  onInviteLinkCopied: () => void;
};

function WorkspaceCard({
  workspace,
  activeWorkspaceId,
  onRename,
  onLeave,
  onToastSuccess,
  onToastError,
  onInviteLinkCopied,
}: WorkspaceCardProps) {
  const kebabRef = useRef<HTMLButtonElement>(null);
  const renameInputRef = useRef<HTMLInputElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(workspace.name);
  const [leaveModalOpen, setLeaveModalOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  const isAdmin = workspace.memberRole === "admin";
  const isActiveWorkspace = workspace.id === activeWorkspaceId;
  const cannotLeave = workspace.isOnlyAdmin || isActiveWorkspace;
  const shortId = workspaceShortId(workspace.id);

  const editingFieldStyle: CSSProperties = {
    flex: 1,
    minWidth: 0,
    display: "flex",
    alignItems: "center",
    gap: 8,
    height: 38,
    boxSizing: "border-box",
    padding: "0 12px",
    borderRadius: 6,
    border: "1px solid var(--border-strong, #c9c0b4)",
    background: "var(--neutral-0, #ffffff)",
    overflow: "hidden",
  };

  useEffect(() => {
    setDraftName(workspace.name);
  }, [workspace.name]);

  useEffect(() => {
    if (!editing) return;
    renameInputRef.current?.focus();
    renameInputRef.current?.select();
  }, [editing]);

  const cancelEdit = useCallback(() => {
    setDraftName(workspace.name);
    setEditing(false);
  }, [workspace.name]);

  const saveRename = useCallback(async () => {
    const trimmed = draftName.trim();
    if (!trimmed || trimmed === workspace.name) {
      cancelEdit();
      return;
    }
    if (!isAdmin) {
      onToastError();
      cancelEdit();
      return;
    }
    setBusy(true);
    const ok = await onRename(workspace.id, trimmed);
    setBusy(false);
    if (ok) {
      onToastSuccess();
      setEditing(false);
    } else {
      onToastError();
      setDraftName(workspace.name);
      setEditing(false);
    }
  }, [
    cancelEdit,
    draftName,
    isAdmin,
    onRename,
    onToastError,
    onToastSuccess,
    workspace.id,
    workspace.name,
  ]);

  const confirmLeave = useCallback(async () => {
    setBusy(true);
    const ok = await onLeave(workspace.id);
    setBusy(false);
    setLeaveModalOpen(false);
    if (ok) {
      onToastSuccess();
    } else {
      onToastError();
    }
  }, [onLeave, onToastError, onToastSuccess, workspace.id]);

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveRename();
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelEdit();
    }
  };

  const copyInviteLink = useCallback(async () => {
    setMenuOpen(false);
    try {
      await navigator.clipboard.writeText(buildWorkspaceInviteLink(workspace.id));
      onInviteLinkCopied();
    } catch {
      onToastError();
    }
  }, [onInviteLinkCopied, onToastError, workspace.id]);

  return (
    <>
      <div style={workspaceCardStyle}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {editing ? (
            <div style={editingFieldStyle}>
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 14,
                  fontWeight: 400,
                  color: "var(--text-disabled, #c9c0b4)",
                  whiteSpace: "nowrap",
                }}
              >
                {shortId}
              </span>
              <input
                ref={renameInputRef}
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={() => void saveRename()}
                onKeyDown={handleRenameKeyDown}
                disabled={busy}
                style={{
                  flex: 1,
                  minWidth: 0,
                  border: "none",
                  outline: "none",
                  background: "transparent",
                  fontSize: 14,
                  fontWeight: 400,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  color: "var(--text-primary, #2e1c1c)",
                }}
              />
              <button
                type="button"
                aria-label="Cancel rename"
                onMouseDown={(e) => e.preventDefault()}
                onClick={cancelEdit}
                style={{
                  flexShrink: 0,
                  border: "none",
                  background: "transparent",
                  cursor: "pointer",
                  padding: 4,
                  color: "var(--text-secondary, #6b5e55)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon name="close" size={16} />
              </button>
            </div>
          ) : (
            <div style={readOnlyFieldStyle} aria-readonly="true">
              <span
                style={{
                  flexShrink: 0,
                  fontSize: 14,
                  fontWeight: 400,
                  color: "var(--text-disabled, #c9c0b4)",
                }}
              >
                {shortId}
              </span>
              <span
                style={{
                  minWidth: 0,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  fontSize: 14,
                  fontWeight: 400,
                  color: "var(--text-secondary, #6b5e55)",
                }}
              >
                {workspace.name}
              </span>
            </div>
          )}

          <IconSquareButton
            ref={kebabRef}
            icon="kebab"
            label={`Options for ${workspace.name}`}
            iconSize={16}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            disabled={busy}
            onClick={() => setMenuOpen((open) => !open)}
          />

          <Menu
            open={menuOpen}
            onClose={() => setMenuOpen(false)}
            anchorRef={kebabRef}
            align="right"
            portal
            portalZIndex={300}
            type="context-menu"
            aria-label={`${workspace.name} options`}
          >
            <MenuItem
              label="Copy invite link"
              icon="link"
              onClick={() => void copyInviteLink()}
            />
            <MenuItem
              label="Rename workspace"
              icon="edit"
              disabled={!isAdmin}
              onClick={() => {
                setMenuOpen(false);
                setEditing(true);
              }}
            />
            {cannotLeave && isActiveWorkspace ? (
              <Tooltip label="You cannot leave your active workspace" position="left" fullWidth>
                <span style={{ display: "block", width: "100%" }}>
                  <MenuItem
                    label="Leave workspace"
                    icon="minus"
                    disabled
                    onClick={() => {}}
                  />
                </span>
              </Tooltip>
            ) : (
              <MenuItem
                label="Leave workspace"
                icon="minus"
                disabled={cannotLeave}
                onClick={() => {
                  setMenuOpen(false);
                  setLeaveModalOpen(true);
                }}
              />
            )}
          </Menu>
        </div>
      </div>

      <Modal
        open={leaveModalOpen}
        type="destructive"
        size="sm"
        title="Leave workspace?"
        description="You will lose access to all projects and reviews in this workspace. This cannot be undone."
        confirmLabel="Leave workspace"
        onConfirm={() => void confirmLeave()}
        onClose={() => setLeaveModalOpen(false)}
      />
    </>
  );
}

export function ProfilePageClient({
  userId,
  email,
  activeWorkspaceId,
  contributor,
  roleOptions,
  workspaces: initialWorkspaces,
}: ProfilePageClientProps) {
  const router = useRouter();
  const supabase = useMemo(() => createSupabaseBrowserClient(), []);
  const { showToast } = useToast();

  const initialNameParts = useMemo(
    () => splitDisplayName(contributor?.name ?? ""),
    [contributor?.name],
  );

  const [firstName, setFirstName] = useState(initialNameParts.firstName);
  const [lastName, setLastName] = useState(initialNameParts.lastName);
  const [emailValue, setEmailValue] = useState(email ?? "");
  const [roleName, setRoleName] = useState(contributor?.roleName ?? "");
  const [workspaces, setWorkspaces] = useState(initialWorkspaces);
  const [errorToast, setErrorToast] = useState<string | null>(null);
  const [addWorkspaceOpen, setAddWorkspaceOpen] = useState(false);
  const [addWorkspaceActiveCard, setAddWorkspaceActiveCard] = useState<"create" | "join" | null>(
    null,
  );
  const [createWorkspaceName, setCreateWorkspaceName] = useState("");
  const [joinInviteLink, setJoinInviteLink] = useState("");
  const [addWorkspaceSubmitting, setAddWorkspaceSubmitting] = useState(false);
  const [createWorkspaceErrorMessage, setCreateWorkspaceErrorMessage] = useState<string | null>(null);
  const [joinInviteErrorMessage, setJoinInviteErrorMessage] = useState<string | null>(null);
  const [workspaceSwitchConfirm, setWorkspaceSwitchConfirm] = useState<{
    workspaceId: string;
    workspaceName: string;
    kind: "created" | "joined";
  } | null>(null);
  const addWorkspaceSubmittingRef = useRef(false);
  const [emailSuccessNotice, setEmailSuccessNotice] = useState<string | null>(null);
  const [emailErrorMessage, setEmailErrorMessage] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);
  const [savingEmail, setSavingEmail] = useState(false);
  const [savingRole, setSavingRole] = useState(false);

  const savedNameRef = useRef(combineDisplayName(initialNameParts.firstName, initialNameParts.lastName));
  const savedEmailRef = useRef(email ?? "");
  const savedRoleRef = useRef(contributor?.roleName ?? "");

  useEffect(() => {
    const parts = splitDisplayName(contributor?.name ?? "");
    setFirstName(parts.firstName);
    setLastName(parts.lastName);
    savedNameRef.current = combineDisplayName(parts.firstName, parts.lastName);
  }, [contributor?.name]);

  useEffect(() => {
    setEmailValue(email ?? "");
    savedEmailRef.current = email ?? "";
  }, [email]);

  useEffect(() => {
    setRoleName(contributor?.roleName ?? "");
    savedRoleRef.current = contributor?.roleName ?? "";
  }, [contributor?.roleName]);

  useEffect(() => {
    setWorkspaces(initialWorkspaces);
  }, [initialWorkspaces]);

  const showErrorToast = useCallback(() => {
    setErrorToast("Failed to save — please try again");
  }, []);

  const showSuccessToast = useCallback(() => {
    showToast("Changes saved");
  }, [showToast]);

  const showInviteLinkCopiedToast = useCallback(() => {
    showToast("Invite link copied");
  }, [showToast]);

  const reportCreateWorkspaceError = useCallback((message: string) => {
    setCreateWorkspaceErrorMessage(message);
    setErrorToast(message);
  }, []);

  const reportJoinWorkspaceError = useCallback((message: string) => {
    setJoinInviteErrorMessage(message);
    setErrorToast(message);
  }, []);

  const roleSelectOptions = useMemo(
    () => roleOptions.map((role) => ({ value: role.name, label: role.name })),
    [roleOptions],
  );

  const roleSelectOptionsWithCurrent = useMemo(() => {
    const options = [...roleSelectOptions];
    const current = roleName.trim();
    if (current && !options.some((option) => option.value === current)) {
      options.push({ value: current, label: current });
    }
    return options;
  }, [roleName, roleSelectOptions]);

  const saveDisplayName = useCallback(async () => {
    const nextName = combineDisplayName(firstName, lastName);
    if (!contributor?.id || !userId || !activeWorkspaceId) return;
    if (!nextName || nextName === savedNameRef.current) return;

    setSavingName(true);
    const { error } = await supabase
      .from("contributors")
      .update({ name: nextName })
      .eq("user_id", userId)
      .eq("workspace_id", activeWorkspaceId);

    setSavingName(false);
    if (error) {
      const parts = splitDisplayName(savedNameRef.current);
      setFirstName(parts.firstName);
      setLastName(parts.lastName);
      showErrorToast();
      return;
    }
    savedNameRef.current = nextName;
    showSuccessToast();
  }, [
    activeWorkspaceId,
    contributor?.id,
    firstName,
    lastName,
    showErrorToast,
    showSuccessToast,
    supabase,
    userId,
  ]);

  const saveEmail = useCallback(async () => {
    const trimmed = emailValue.trim();
    if (!userId || !trimmed || trimmed === savedEmailRef.current.trim()) return;

    setSavingEmail(true);
    setEmailSuccessNotice(null);
    setEmailErrorMessage(null);

    // Confirmation email is sent by Supabase Auth — branded HTML template:
    // lib/emails/email-change-confirmation-email.ts (paste into Supabase Dashboard).
    const { error } = await supabase.auth.updateUser(
      { email: trimmed },
      { emailRedirectTo: `${getSiteOrigin()}/auth/callback` },
    );
    setSavingEmail(false);

    if (error) {
      setEmailErrorMessage(error.message);
      setEmailValue(savedEmailRef.current);
      return;
    }

    setEmailSuccessNotice(
      `A confirmation email has been sent to ${trimmed}. Your email will update once confirmed.`,
    );
    setEmailValue(savedEmailRef.current);
  }, [emailValue, supabase.auth, userId]);

  const saveRole = useCallback(
    async (nextRole: string) => {
      if (!contributor?.id || !userId || !activeWorkspaceId) return;
      if (nextRole === savedRoleRef.current) return;

      setSavingRole(true);
      const roleFields = await resolveContributorRoleFields(supabase, nextRole);
      const { error } = await supabase
        .from("contributors")
        .update({ role: roleFields.role, role_id: roleFields.role_id })
        .eq("user_id", userId)
        .eq("workspace_id", activeWorkspaceId);

      setSavingRole(false);
      if (error) {
        setRoleName(savedRoleRef.current);
        showErrorToast();
        return;
      }
      savedRoleRef.current = nextRole;
      showSuccessToast();
    },
    [
      activeWorkspaceId,
      contributor?.id,
      showErrorToast,
      showSuccessToast,
      supabase,
      userId,
    ],
  );

  const handleNameKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveDisplayName();
    }
  };

  const handleEmailKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void saveEmail();
    }
  };

  const handleRoleChange = (value: string) => {
    setRoleName(value);
    void saveRole(value);
  };

  const renameWorkspace = useCallback(
    async (workspaceId: string, nextName: string) => {
      const { error } = await supabase
        .from("workspaces")
        .update({ name: nextName })
        .eq("id", workspaceId);

      if (error) return false;

      setWorkspaces((current) =>
        current.map((workspace) =>
          workspace.id === workspaceId
            ? { ...workspace, name: nextName }
            : workspace,
        ),
      );
      router.refresh();
      return true;
    },
    [router, supabase],
  );

  const resetAddWorkspaceModal = useCallback(() => {
    setCreateWorkspaceName("");
    setJoinInviteLink("");
    setAddWorkspaceActiveCard(null);
    setCreateWorkspaceErrorMessage(null);
    setJoinInviteErrorMessage(null);
    addWorkspaceSubmittingRef.current = false;
    setAddWorkspaceSubmitting(false);
  }, []);

  const closeAddWorkspaceModal = useCallback(() => {
    setAddWorkspaceOpen(false);
    resetAddWorkspaceModal();
  }, [resetAddWorkspaceModal]);

  const addWorkspaceHasValue =
    createWorkspaceName.trim().length > 0 || joinInviteLink.trim().length > 0;

  const createWorkspacePreviewId = useMemo(
    () => (createWorkspaceName.trim() ? workspaceNamePreviewId(createWorkspaceName) : null),
    [createWorkspaceName],
  );

  const resolveAddWorkspaceAction = useCallback((): "create" | "join" | null => {
    const trimmedCreate = createWorkspaceName.trim();
    const trimmedJoin = joinInviteLink.trim();

    if (addWorkspaceActiveCard === "join" && trimmedJoin) return "join";
    if (addWorkspaceActiveCard === "create" && trimmedCreate) return "create";
    if (trimmedCreate) return "create";
    if (trimmedJoin) return "join";
    return null;
  }, [addWorkspaceActiveCard, createWorkspaceName, joinInviteLink]);

  const userAlreadyOwnsWorkspaceName = useCallback(
    async (name: string): Promise<boolean> => {
      const normalized = normalizeWorkspaceNameKey(name);
      if (
        workspaces.some((workspace) => normalizeWorkspaceNameKey(workspace.name) === normalized)
      ) {
        return true;
      }

      const { data: ownedRows, error } = await supabase
        .from("workspaces")
        .select("name")
        .eq("created_by", userId!);

      if (error) return false;

      return (ownedRows ?? []).some(
        (row) => normalizeWorkspaceNameKey(String(row.name ?? "")) === normalized,
      );
    },
    [supabase, userId, workspaces],
  );

  const handleConfirmStayHere = useCallback(() => {
    setWorkspaceSwitchConfirm(null);
    router.refresh();
  }, [router]);

  const handleGoToWorkspace = useCallback(async () => {
    if (!userId || !addWorkspaceHasValue) return;
    if (addWorkspaceSubmittingRef.current) return;

    const action = resolveAddWorkspaceAction();
    if (!action) return;

    addWorkspaceSubmittingRef.current = true;
    setAddWorkspaceSubmitting(true);

    const joinNotFoundMessage =
      "We couldn't find that workspace. Check the link and try again.";

    try {
      if (action === "create") {
        const trimmedName = createWorkspaceName.trim();

        if (await userAlreadyOwnsWorkspaceName(trimmedName)) {
          reportCreateWorkspaceError(duplicateOwnedWorkspaceMessage(trimmedName));
          return;
        }

        const { data: workspace, error: wsError } = await supabase
          .from("workspaces")
          .insert({
            name: trimmedName,
            invite_code: generateInviteCode(trimmedName),
            created_by: userId,
          })
          .select()
          .single();

        if (wsError || !workspace) {
          reportCreateWorkspaceError(parseWorkspaceCreateError(wsError, trimmedName));
          return;
        }

        const { error: memberError } = await ensureWorkspaceMember(supabase, {
          workspace_id: workspace.id,
          user_id: userId,
          role: "admin",
          permission_level: "admin",
          status: "active",
        });

        if (memberError) {
          reportCreateWorkspaceError(memberError);
          return;
        }

        const creatorDisplayName =
          combineDisplayName(firstName, lastName).trim() ||
          contributor?.name?.trim() ||
          email?.split("@")[0] ||
          "User";

        const { error: contributorError } = await ensureContributorProfile(supabase, {
          userId,
          email: email?.trim() || null,
          displayName: creatorDisplayName,
          role: roleName.trim() || contributor?.roleName || null,
          activeWorkspaceId: workspace.id,
          permissionLevel: "admin",
        });

        if (contributorError) {
          reportCreateWorkspaceError(contributorError);
          return;
        }

        setWorkspaces((current) => [
          ...current,
          {
            id: workspace.id,
            name: workspace.name,
            memberRole: "admin",
            status: "active",
            isOnlyAdmin: true,
          },
        ]);
        setWorkspaceSwitchConfirm({
          workspaceId: workspace.id,
          workspaceName: workspace.name,
          kind: "created",
        });
        closeAddWorkspaceModal();
        return;
      }

      const shortId = parseJoinLinkShortId(joinInviteLink);
      if (!shortId) {
        reportJoinWorkspaceError(joinNotFoundMessage);
        return;
      }

      const { data: workspaceRows, error: lookupError } = await supabase
        .from("workspaces")
        .select("id, name");

      if (lookupError) {
        reportJoinWorkspaceError(lookupError.message);
        return;
      }

      const workspace = workspaceRows?.find((row) =>
        String(row.id).toLowerCase().startsWith(shortId),
      );

      if (!workspace) {
        reportJoinWorkspaceError(joinNotFoundMessage);
        return;
      }

      const { error: joinError } = await ensureWorkspaceMember(supabase, {
        workspace_id: workspace.id,
        user_id: userId,
        role: "member",
        permission_level: "reviewer",
        status: "active",
      });
      if (joinError) {
        reportJoinWorkspaceError(joinError);
        return;
      }

      setWorkspaceSwitchConfirm({
        workspaceId: workspace.id,
        workspaceName: workspace.name,
        kind: "joined",
      });
      closeAddWorkspaceModal();
    } finally {
      addWorkspaceSubmittingRef.current = false;
      setAddWorkspaceSubmitting(false);
    }
  }, [
    addWorkspaceHasValue,
    closeAddWorkspaceModal,
    contributor?.name,
    contributor?.roleName,
    createWorkspaceName,
    email,
    firstName,
    joinInviteLink,
    lastName,
    reportCreateWorkspaceError,
    reportJoinWorkspaceError,
    resolveAddWorkspaceAction,
    roleName,
    supabase,
    userAlreadyOwnsWorkspaceName,
    userId,
  ]);

  const addWorkspaceSubmitLabel =
    addWorkspaceActiveCard === "join" && joinInviteLink.trim()
      ? "Join workspace"
      : "Create workspace";

  const leaveWorkspace = useCallback(
    async (workspaceId: string) => {
      if (!userId) return false;

      const { error } = await supabase
        .from("workspace_members")
        .delete()
        .eq("workspace_id", workspaceId)
        .eq("user_id", userId);

      if (error) return false;

      setWorkspaces((current) =>
        current.filter((workspace) => workspace.id !== workspaceId),
      );
      router.refresh();
      return true;
    },
    [router, supabase, userId],
  );

  if (!userId) {
    return (
      <p style={{ margin: 0, fontSize: 15, color: "var(--text-secondary, #6b5e55)" }}>
        Sign in to view your profile.
      </p>
    );
  }

  return (
    <div style={pageStyle}>
      {errorToast ? (
        <ProfileErrorToast
          message={errorToast}
          onDone={() => setErrorToast(null)}
        />
      ) : null}

      <h1
        style={{
          fontSize: 32,
          fontWeight: 800,
          color: "var(--text-heading, #6b1e2e)",
          letterSpacing: "-0.96px",
          lineHeight: 1.2,
          margin: 0,
        }}
      >
        Your Profile
      </h1>

      <section style={cardStyle}>
        <h2 style={cardHeaderStyle}>Your Details</h2>
        <div style={cardBodyStyle}>
          <div
            style={{
              display: "flex",
              gap: 24,
              alignItems: "flex-start",
            }}
          >
            <div
              style={{
                flex: 1,
                minWidth: 0,
                display: "flex",
                flexDirection: "column",
                gap: 24,
              }}
            >
              <Input
                label="First Name"
                size="md"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                onBlur={() => void saveDisplayName()}
                onKeyDown={handleNameKeyDown}
                disabled={!contributor || savingName}
              />

              <Input
                label="Last Name"
                size="md"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                onBlur={() => void saveDisplayName()}
                onKeyDown={handleNameKeyDown}
                disabled={!contributor || savingName}
              />

              <div>
                <Input
                  label="Email Address"
                  type="email"
                  size="md"
                  value={emailValue}
                  onChange={(e) => {
                    setEmailValue(e.target.value);
                    setEmailSuccessNotice(null);
                    setEmailErrorMessage(null);
                  }}
                  onBlur={() => void saveEmail()}
                  onKeyDown={handleEmailKeyDown}
                  disabled={savingEmail}
                  error={Boolean(emailErrorMessage)}
                  errorMessage={emailErrorMessage ?? undefined}
                />
                {emailSuccessNotice ? (
                  <p
                    style={{
                      margin: "6px 0 0",
                      fontSize: 13,
                      lineHeight: 1.5,
                      color: "var(--text-secondary, #6b5e55)",
                    }}
                  >
                    {emailSuccessNotice}
                  </p>
                ) : null}
              </div>

              <CreatableRoleSelect
                options={roleSelectOptionsWithCurrent}
                value={roleName || undefined}
                onChange={handleRoleChange}
                size="md"
                disabled={!contributor || savingRole || roleSelectOptions.length === 0}
                placeholder={
                  roleSelectOptions.length === 0 ? "No roles set up yet" : "Select role"
                }
              />
            </div>

            <div
              style={{
                width: 148,
                flexShrink: 0,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 12,
              }}
            >
              <div
                style={{
                  width: 100,
                  height: 100,
                  borderRadius: 9999,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: 32,
                  fontWeight: 800,
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                  ...getAvatarInlineStyle(
                    avatarColourKey(email, contributor?.id),
                  ),
                }}
                aria-hidden
              >
                {profileAvatarInitials(firstName, lastName)}
              </div>

              <Tooltip label="Coming soon" position="top">
                <span style={{ display: "inline-flex" }}>
                  <Button
                    label="Upload Image"
                    variant="ghost"
                    size="sm"
                    icon="leading"
                    iconName="upload"
                    disabled
                  />
                </span>
              </Tooltip>
            </div>
          </div>
        </div>
      </section>

      <section style={cardStyle}>
        <h2 style={cardHeaderStyle}>Your Workspaces</h2>
        <div style={workspacesCardBodyStyle}>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {workspaces.map((workspace) => (
              <WorkspaceCard
                key={workspace.id}
                workspace={workspace}
                activeWorkspaceId={activeWorkspaceId}
                onRename={renameWorkspace}
                onLeave={leaveWorkspace}
                onToastSuccess={showSuccessToast}
                onToastError={showErrorToast}
                onInviteLinkCopied={showInviteLinkCopiedToast}
              />
            ))}
          </div>

          <div style={{ marginTop: 16 }}>
            <Button
              label="Workspace"
              variant="ghost"
              size="sm"
              icon="leading"
              iconName="plus"
              onClick={() => setAddWorkspaceOpen(true)}
            />
          </div>
        </div>
      </section>

      <Modal
        open={addWorkspaceOpen}
        type="form"
        size="md"
        title="Add a Workspace"
        onClose={closeAddWorkspaceModal}
        footerNoPadding
        footer={
          <div
            style={{
              display: "flex",
              justifyContent: "flex-end",
              gap: 8,
              width: "100%",
              minWidth: 0,
              alignSelf: "stretch",
              padding: "0 24px 16px",
              boxSizing: "border-box",
            }}
          >
            <Button
              label="Cancel"
              variant="secondary"
              size="sm"
              onClick={closeAddWorkspaceModal}
              disabled={addWorkspaceSubmitting}
            />
            <Button
              label={addWorkspaceSubmitLabel}
              variant="primary"
              size="sm"
              icon="trailing"
              iconName="chevron-right"
              disabled={!addWorkspaceHasValue || addWorkspaceSubmitting}
              onClick={() => void handleGoToWorkspace()}
            />
          </div>
        }
      >
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <div
            style={{
              ...(addWorkspaceActiveCard === "create" ? accentCardStyle : defaultOptionCardStyle),
              borderRadius: 8,
              padding: 16,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 600,
                color: "var(--text-heading, #6b1e2e)",
              }}
            >
              Create a new workspace
            </p>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                fontWeight: 400,
                color: "var(--text-secondary, #6b5e55)",
              }}
            >
              Start fresh with your own projects and decisions.
            </p>
            <div style={{ marginTop: 16 }}>
              <label
                htmlFor="create-workspace-name"
                style={{
                  display: "block",
                  marginBottom: 6,
                  fontSize: 14,
                  fontWeight: 500,
                  color: "var(--text-primary, #2e1c1c)",
                }}
              >
                Workspace Name
              </label>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  height: 38,
                  padding: "0 12px",
                  borderRadius: 6,
                  border: createWorkspaceErrorMessage
                    ? "1px solid var(--sentiment-danger-border, #c62828)"
                    : "1px solid var(--border-default, #e4ddd3)",
                  background: "var(--neutral-0, #ffffff)",
                  boxSizing: "border-box",
                }}
              >
                {createWorkspacePreviewId ? (
                  <span
                    style={{
                      flexShrink: 0,
                      fontSize: 14,
                      color: "var(--text-disabled, #c9c0b4)",
                    }}
                  >
                    {createWorkspacePreviewId}
                  </span>
                ) : null}
                <input
                  id="create-workspace-name"
                  type="text"
                  className={inputStyles.input}
                  value={createWorkspaceName}
                  placeholder="i.e. Acme Inc"
                  onFocus={() => setAddWorkspaceActiveCard("create")}
                  onChange={(e) => {
                    setAddWorkspaceActiveCard("create");
                    setCreateWorkspaceName(e.target.value);
                    setCreateWorkspaceErrorMessage(null);
                  }}
                />
              </div>
              {createWorkspaceErrorMessage ? (
                <p
                  role="alert"
                  style={{ margin: "6px 0 0", fontSize: 13, color: "#8b2020" }}
                >
                  {createWorkspaceErrorMessage}
                </p>
              ) : null}
            </div>
          </div>

          <div
            style={{
              ...(addWorkspaceActiveCard === "join" ? accentCardStyle : defaultOptionCardStyle),
              borderRadius: 8,
              padding: 16,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: 16,
                fontWeight: 600,
                color: "var(--text-heading, #6b1e2e)",
              }}
            >
              Join an existing workspace
            </p>
            <p
              style={{
                margin: "4px 0 0",
                fontSize: 13,
                fontWeight: 400,
                color: "var(--text-secondary, #6b5e55)",
              }}
            >
              Connect to a team or organisation already using DesignTrace.
            </p>
            <div style={{ marginTop: 16 }}>
              <Input
                label="Workspace invite link"
                size="md"
                placeholder="e.g. https://app.designtrace.ai/join/a1b2c3d4"
                value={joinInviteLink}
                error={Boolean(joinInviteErrorMessage)}
                errorMessage={joinInviteErrorMessage ?? undefined}
                onFocus={() => setAddWorkspaceActiveCard("join")}
                onChange={(e) => {
                  setAddWorkspaceActiveCard("join");
                  setJoinInviteLink(e.target.value);
                  setJoinInviteErrorMessage(null);
                }}
              />
            </div>
          </div>
        </div>
      </Modal>

      <WorkspaceSwitchConfirmModal
        open={workspaceSwitchConfirm != null}
        workspaceId={workspaceSwitchConfirm?.workspaceId ?? ""}
        workspaceName={workspaceSwitchConfirm?.workspaceName ?? ""}
        kind={workspaceSwitchConfirm?.kind ?? "created"}
        onStay={handleConfirmStayHere}
        onError={(message) => setErrorToast(message)}
      />
    </div>
  );
}
