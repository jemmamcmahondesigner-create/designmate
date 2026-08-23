"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import teammateKebabStyles from "./TeammatesSettingsPage.module.css";
import settingsTableLayoutStyles from "./settingsTableLayout.module.css";
import { DiscardChangesModal } from "@/components/DiscardChangesModal";
import { SpinnerIcon } from "@/components/auth/SpinnerIcon";
import buttonStyles from "@/components/ui/ds/Button.module.css";
import { useToast } from "@/components/Toast";
import {
  Alert,
  Button,
  Checkbox,
  Icon,
  IconSquareButton,
  Input,
  Menu,
  MenuItem,
  Modal,
  Select,
  StatusPill,
  Table,
  Tooltip,
  type ColumnDef,
  type TablePageSizeOption,
} from "@/components/ui/ds";
import {
  ensureContributorRole,
  fetchWorkspaceRoleOptions,
  parseWorkspaceRoleValue,
  titleCaseRoleName,
} from "@/lib/workspace/contributorRoles";
import { useRouter } from "next/navigation";
import { useWorkspacePermission } from "@/hooks/useWorkspacePermission";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolveContributorRoleFields } from "@/lib/workspace/resolveContributorRoleFields";
import { cancelWorkspaceInvite, sendWorkspaceInvite } from "@/lib/workspace/invite-client";
import { inviteToastMessage } from "@/lib/workspace/invite-toast";
import { getAvatarInlineStyle, avatarColourKey } from "@/lib/utils/avatarColour";
import type { WorkspaceTeammate } from "@/lib/workspace/teammates";
import {
  canAddTeammates,
  canEditTeammatePermission,
  canShowTeammateKebabMenu,
  isOwnTeammateRow,
  isPaidPermissionLevel,
  mapWorkspaceMemberRole,
  normalizeTeammatePermissionFields,
  toStoredPermissionLevel,
  type ContentPermissionLevel,
  type WorkspacePermissionLevel,
} from "@/lib/workspace/permissions";

type Teammate = WorkspaceTeammate;

const NAME_REQUIRED_MESSAGE = "Please enter the teammate's first and last name.";
const CUSTOM_ROLE_PREFIX = "__custom__:";

type RoleOption = { id: string; name: string };

type FormState = {
  name: string;
  email: string;
  roleId: string;
  permissionLevel: ContentPermissionLevel;
  isAdmin: boolean;
};

const ADMIN_ACCESS_HELPER =
  "Grants workspace-level controls: billing, teammate management, and settings. At least one Admin must always exist.";

const LAST_ADMIN_ERROR =
  "At least one Admin must exist. Assign Admin to another teammate first.";

const ROWS_PER_PAGE_STORAGE_KEY = "dt_teammates_rows_per_page";
const ROWS_PER_PAGE_OPTIONS: TablePageSizeOption[] = [10, 20, 40, 80, "all"];

function readStoredRowsPerPage(): TablePageSizeOption {
  if (typeof window === "undefined") return 10;
  try {
    const stored = localStorage.getItem(ROWS_PER_PAGE_STORAGE_KEY);
    if (stored === "all") return "all";
    const n = Number(stored);
    if (n === 10 || n === 20 || n === 40 || n === 80) return n;
  } catch {
    /* ignore */
  }
  return 10;
}

const PAID_SEAT_TOOLTIP =
  "Admin and Editor seats will require a paid subscription in a future update. Reviewer access is always free.";

const PERMISSION_TOOLTIPS: Record<ContentPermissionLevel, string> = {
  editor:
    "Can create and edit projects and reviews. Cannot manage workspace settings.",
  reviewer:
    "Can view and provide feedback on reviews. Cannot create projects or invite teammates.",
};

const EMPTY_CELL_STYLE: CSSProperties = {
  color: "var(--text-disabled, #c9c0b4)",
  fontSize: 13,
};

export function TeammatesSettingsPage({
  initialTeammates,
  initialContributorRoles = [],
  activeWorkspaceId = null,
  noWorkspace = false,
}: {
  initialTeammates: Teammate[];
  initialContributorRoles?: RoleOption[];
  activeWorkspaceId?: string | null;
  noWorkspace?: boolean;
}) {
  const [teammates, setTeammates] = useState(initialTeammates);

  useEffect(() => {
    setTeammates(initialTeammates);
  }, [initialTeammates]);

  useEffect(() => {
    setRowsPerPage(readStoredRowsPerPage());
  }, []);

  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [rowsPerPage, setRowsPerPage] = useState<TablePageSizeOption>(10);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const { showToast } = useToast();
  /** Client-only overlay (browser fetch + newly created roles). Always merged with `initialContributorRoles` for the Select. */
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const roleOptionsRef = useRef<RoleOption[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [adminAccessError, setAdminAccessError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const router = useRouter();
  const {
    workspacePermissionLevel,
    reviewerType,
    userId: currentUserId,
    workspacePermissionLoading: permissionLoading,
  } = useWorkspacePermission(activeWorkspaceId);
  const canManageTeammates = canAddTeammates(workspacePermissionLevel);
  const canEditPermission = canEditTeammatePermission(workspacePermissionLevel);

  const [addOpen, setAddOpen] = useState(false);
  const [addSubmitting, setAddSubmitting] = useState(false);
  const [editRow, setEditRow] = useState<Teammate | null>(null);
  const editingOwnRow = isOwnTeammateRow(editRow?.userId, currentUserId);
  const showPermissionFieldInEdit = canEditPermission && !editingOwnRow;
  const [removeRow, setRemoveRow] = useState<Teammate | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [pendingClose, setPendingClose] = useState<null | "add" | "edit">(null);
  const [form, setForm] = useState<FormState>({
    name: "",
    email: "",
    roleId: "",
    permissionLevel: "reviewer",
    isAdmin: false,
  });

  const activeAdminCount = useMemo(
    () =>
      teammates.filter((row) => row.isAdmin && !row.isPending && !row.isPendingInvite).length,
    [teammates],
  );

  const editingLastAdmin = Boolean(editRow?.isAdmin && activeAdminCount === 1);

  const handleAdminAccessChange = useCallback(
    (checked: boolean) => {
      if (!checked && editingLastAdmin) {
        setAdminAccessError(LAST_ADMIN_ERROR);
        return;
      }
      setAdminAccessError(null);
      setForm((prev) => ({ ...prev, isAdmin: checked }));
    },
    [editingLastAdmin],
  );

  useEffect(() => {
    let cancelled = false;
    const loadRoles = async () => {
      const supabase = createSupabaseBrowserClient();
      const mapped = await fetchWorkspaceRoleOptions(supabase, activeWorkspaceId);
      if (cancelled) return;
      setRoleOptions(sortRoleOptions(mapped));
    };
    void loadRoles();
    return () => {
      cancelled = true;
    };
  }, [addOpen, editRow, activeWorkspaceId]);

  const actionRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const total = teammates.length;
  const effectivePageSize =
    rowsPerPage === "all" ? Math.max(total, 1) : rowsPerPage;
  const pageCount = Math.max(1, Math.ceil(total / effectivePageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * effectivePageSize;
  const pagedRows = teammates.slice(start, start + effectivePageSize);

  const mergedRoleOptions = useMemo(() => {
    const byName = new Map<string, RoleOption>();
    for (const r of initialContributorRoles) {
      const name = r.name.trim();
      if (!name) continue;
      byName.set(name.toLowerCase(), { id: name, name });
    }
    for (const r of roleOptions) {
      const name = r.name.trim();
      if (!name) continue;
      byName.set(name.toLowerCase(), { id: name, name });
    }
    return sortRoleOptions([...byName.values()]);
  }, [initialContributorRoles, roleOptions]);

  const roleSelectOptions = useMemo(
    () =>
      mergedRoleOptions.map((role) => ({
        value: role.name,
        label: role.name,
      })),
    [mergedRoleOptions],
  );

  const addRoleSelectOptions = useMemo(() => {
    const opts = [...roleSelectOptions];
    const v = form.roleId.trim();
    if (!v || opts.some((o) => o.value === v)) return opts;
    const label = titleCaseRoleName(v) || v;
    opts.push({ value: v, label });
    return opts;
  }, [roleSelectOptions, form.roleId]);

  const editRoleSelectOptions = useMemo(() => {
    const opts = [...roleSelectOptions];
    const v = form.roleId.trim();
    if (!v || opts.some((o) => o.value === v)) return opts;
    const label = titleCaseRoleName(v) || v;
    opts.push({ value: v, label });
    return opts;
  }, [roleSelectOptions, form.roleId]);

  const formDirty = useMemo(() => {
    if (addOpen) {
      return (
        form.name.trim() !== "" ||
        form.email.trim() !== "" ||
        form.roleId.trim() !== ""
      );
    }
    if (editRow) {
      return (
        form.name.trim() !== editRow.name ||
        form.email.trim() !== (editRow.email ?? "") ||
        form.roleId !== initialRoleFormValue(editRow, mergedRoleOptions) ||
        form.permissionLevel !== editRow.permissionLevel ||
        form.isAdmin !== editRow.isAdmin
      );
    }
    return false;
  }, [addOpen, editRow, form, mergedRoleOptions]);

  useLayoutEffect(() => {
    roleOptionsRef.current = mergedRoleOptions;
  }, [mergedRoleOptions]);

  useEffect(() => {
    // Intentionally no debug logging here.
  }, [roleSelectOptions]);

  const mergeRoleIntoOptions = (name: string) => {
    const label = name.trim();
    if (!label) return;
    setRoleOptions((prev) => {
      const key = label.toLowerCase();
      const next = sortRoleOptions([
        ...prev.filter((r) => r.name.toLowerCase() !== key),
        { id: label, name: label },
      ]);
      roleOptionsRef.current = next;
      return next;
    });
  };

  const handleCreateRoleOption = async (typed: string): Promise<string | undefined> => {
    const supabase = createSupabaseBrowserClient();
    const created = await ensureContributorRole(supabase, typed);
    if (!created) return undefined;
    mergeRoleIntoOptions(created.name);
    return created.name;
  };

  const resendInvite = async (row: Teammate) => {
    if (!isPendingMemberRow(row) || !row.email?.trim() || !activeWorkspaceId) return;
    setOpenMenuId(null);
    const result = await sendWorkspaceInvite({
      workspace_id: activeWorkspaceId,
      email: row.email.trim(),
      permission_level: toStoredPermissionLevel(row.permissionLevel, row.isAdmin),
    });
    if (result.status === "error") {
      showToast({ message: result.message, sentiment: "danger" });
      return;
    }
    showToast(`Invite resent to ${row.email.trim()}`);
    router.refresh();
  };

  const cancelInvite = async (row: Teammate) => {
    if (!isPendingMemberRow(row)) return;
    setOpenMenuId(null);

    let inviteCode = row.inviteCode?.trim() || "";
    if (!inviteCode && row.email?.trim() && activeWorkspaceId) {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase
        .from("workspace_invites")
        .select("invite_code")
        .eq("workspace_id", activeWorkspaceId)
        .ilike("email", row.email.trim())
        .eq("status", "pending")
        .maybeSingle();
      inviteCode = String(data?.invite_code ?? "").trim();
    }

    if (inviteCode) {
      const result = await cancelWorkspaceInvite(inviteCode);
      if (!result.success) {
        showToast({
          message: result.message ?? "Could not cancel invite.",
          sentiment: "danger",
        });
        return;
      }
    } else if (row.memberId) {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("workspace_members")
        .delete()
        .eq("id", row.memberId);
      if (error) {
        showToast({
          message: error.message || "Could not cancel invite.",
          sentiment: "danger",
        });
        return;
      }
    } else {
      showToast({ message: "Could not cancel invite.", sentiment: "danger" });
      return;
    }

    setTeammates((prev) => prev.filter((item) => item.id !== row.id));
    setSelectedRowId((prev) => (prev === row.id ? null : prev));
    showToast("Invite cancelled");
  };

  const columns: ColumnDef<Teammate>[] = [
    {
      key: "name",
      label: "Name",
      width: "flex",
      cellType: "custom",
      render: (row) => {
        const avatarStyle = getAvatarInlineStyle(avatarColourKey(row.email, row.id));
        const displayName = row.name?.trim() || row.email || "";
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 28,
                height: 28,
                borderRadius: "50%",
                backgroundColor: avatarStyle.backgroundColor,
                color: avatarStyle.color,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 11,
                fontWeight: 600,
                flexShrink: 0,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
                boxShadow: "0 0 0 2px #ffffff, 0 0 0 3px #e4ddd3",
              }}
            >
              {row.isPendingInvite
                ? row.name.trim()
                  ? nameInitialsForTeammate(row.name)
                  : emailInitialForPendingInvite(row.email)
                : nameInitialsForTeammate(row.name)}
            </div>
            <span
              style={{
                fontWeight: row.isPendingInvite ? 400 : 600,
                color: "var(--text-primary, #2e1c1c)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                minWidth: 0,
              }}
            >
              {displayName}
            </span>
          </div>
        );
      },
    },
    {
      key: "role",
      label: "Role",
      width: "flex",
      cellType: "custom",
      render: (row) => {
        const jobRole = displayJobRoleName(row.roleName);
        return (
          <span className={teammateKebabStyles.roleCell}>
            {jobRole ? jobRole : <span style={EMPTY_CELL_STYLE}>—</span>}
          </span>
        );
      },
    },
    {
      key: "email",
      label: "Email Address",
      width: "flex",
      cellType: "custom",
      render: (row) =>
        row.email ? (
          <span className={teammateKebabStyles.emailCell}>
            <a href={`mailto:${row.email}`} className="text-link">
              {row.email}
            </a>
          </span>
        ) : (
          <span style={EMPTY_CELL_STYLE}>—</span>
        ),
    },
    {
      key: "permission",
      label: "Permission",
      width: 180,
      cellType: "status",
      render: (row) => {
        const { stored, content } = resolvePermissionDisplay(row);
        if (stored === "admin") {
          return (
            <div
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                flexWrap: "nowrap",
              }}
            >
              <Tooltip
                label={PERMISSION_TOOLTIPS[content]}
                position="top"
                passThroughFocus
              >
                <span className={teammateKebabStyles.cellPillWrap} tabIndex={0}>
                  {renderWorkspacePermissionPill(content)}
                </span>
              </Tooltip>
              <span className={teammateKebabStyles.cellPillWrap}>
                {renderWorkspacePermissionPill("admin")}
              </span>
            </div>
          );
        }
        return (
          <Tooltip
            label={PERMISSION_TOOLTIPS[content]}
            position="top"
            passThroughFocus
          >
            <span className={teammateKebabStyles.cellPillWrap} tabIndex={0}>
              {renderWorkspacePermissionPill(stored)}
            </span>
          </Tooltip>
        );
      },
    },
    {
      key: "status",
      label: "Status",
      cellType: "status",
      render: (row) => {
        const status = teammateStatus(row);
        if (status === "active") {
          return (
            <StatusPill
              label="Active"
              color="green"
              appearance="filled"
              size="md"
              labelTypography="body"
              className={teammateKebabStyles.tablePillMd}
            />
          );
        }
        if (status === "pending") {
          return (
            <StatusPill
              label="Pending"
              size="md"
              labelTypography="body"
              className={[
                teammateKebabStyles.tablePillMd,
                teammateKebabStyles.statusPillMuted,
              ].join(" ")}
            />
          );
        }
        const fallbackLabel =
          typeof status === "string" && status.length > 0
            ? status.charAt(0).toUpperCase() + status.slice(1)
            : "Inactive";
        return (
          <StatusPill
            label={fallbackLabel}
            size="md"
            labelTypography="body"
            className={[
              teammateKebabStyles.tablePillMd,
              teammateKebabStyles.statusPillMuted,
            ].join(" ")}
          />
        );
      },
    },
    {
      key: "paid",
      label: "Paid",
      cellType: "badge",
      render: (row) =>
        row.isPaid ? (
          <Tooltip label={PAID_SEAT_TOOLTIP} position="left" passThroughFocus>
            <span style={paidIconWrapStyle} tabIndex={0}>
              <Icon name="check-circle-fill" size={16} aria-hidden />
            </span>
          </Tooltip>
        ) : null,
    },
    {
      key: "actions",
      label: "",
      align: "center",
      cellType: "kebab",
      render: (row) => {
        const isOwnRow = isOwnTeammateRow(row.userId, currentUserId);
        const isPendingRow = isPendingMemberRow(row);
        const showKebab = isOwnRow
          ? false
          : isPendingRow
            ? canManageTeammates
            : canShowTeammateKebabMenu(workspacePermissionLevel, {
                rowUserId: row.userId ?? null,
                currentUserId,
              });

        if (!showKebab) return null;

        return (
          <span className={teammateKebabStyles.teammateKebabCell}>
            <IconSquareButton
              ref={(el) => {
                actionRefs.current[row.id] = el;
              }}
              variant="ghost"
              icon="kebab"
              iconSize={16}
              label="Teammate actions"
              aria-expanded={openMenuId === row.id}
              aria-haspopup="menu"
              onClick={() => setOpenMenuId((prev) => (prev === row.id ? null : row.id))}
            />
            <Menu
              open={openMenuId === row.id}
              onClose={() => setOpenMenuId(null)}
              anchorRef={{ current: actionRefs.current[row.id] as HTMLElement | null }}
              align="right"
              portal
              portalZIndex={100}
            >
              {isPendingRow ? (
                <>
                  <MenuItem
                    label="Resend invite"
                    onClick={() => void resendInvite(row)}
                  />
                  <MenuItem
                    label="Cancel invite"
                    onClick={() => void cancelInvite(row)}
                  />
                </>
              ) : (
                <>
                  <MenuItem label="Edit" onClick={() => openEdit(row)} />
                  {!isOwnRow ? (
                    <MenuItem
                      label="Remove"
                      onClick={() => {
                        setOpenMenuId(null);
                        setRemoveRow(row);
                      }}
                    />
                  ) : null}
                </>
              )}
            </Menu>
          </span>
        );
      },
    },
  ];

  const contentPermissionOptions = [
    { value: "reviewer", label: "Reviewer" },
    { value: "editor", label: "Editor" },
  ];

  const openAdd = () => {
    setAddSubmitting(false);
    setFormError(null);
    setNameError(null);
    setAdminAccessError(null);
    setForm({ name: "", email: "", roleId: "", permissionLevel: "reviewer", isAdmin: false });
    setAddOpen(true);
  };

  const openEdit = (row: Teammate) => {
    setFormError(null);
    setAdminAccessError(null);
    setForm({
      name: row.name,
      email: row.email ?? "",
      roleId: initialRoleFormValue(row, mergedRoleOptions),
      permissionLevel: row.permissionLevel,
      isAdmin: row.isAdmin,
    });
    setEditRow(row);
    setOpenMenuId(null);
  };

  const applyRoleIdToForm = (roleId: string) => {
    setForm((prev) => ({ ...prev, roleId }));
  };

  const requestCloseForm = (mode: "add" | "edit") => {
    if (formDirty) {
      setPendingClose(mode);
      setDiscardOpen(true);
      return;
    }
    if (mode === "add") setAddOpen(false);
    if (mode === "edit") setEditRow(null);
  };

  const upsertTeammate = (row: Teammate) => {
    setTeammates((prev) => {
      const exists = prev.some((item) => item.id === row.id);
      if (exists) return prev.map((item) => (item.id === row.id ? row : item));
      return [...prev, row];
    });
  };

  const createTeammate = async () => {
    if (!form.name.trim()) {
      setNameError(NAME_REQUIRED_MESSAGE);
      return;
    }
    if (!form.email.trim()) return;
    setFormError(null);
    setNameError(null);
    const inviteEmail = form.email.trim().toLowerCase();
    const alreadyActive = teammates.some((row) => {
      const email = row.email?.trim().toLowerCase();
      return email === inviteEmail && !row.isPending && !row.isPendingInvite;
    });
    if (alreadyActive) {
      setFormError(`${form.name.trim() || form.email.trim()} is already a member of this workspace.`);
      return;
    }
    if (!activeWorkspaceId) {
      setFormError("No workspace found. Complete onboarding to add teammates.");
      return;
    }

    const roleName = resolveRoleTextFromFormValue(
      form.roleId,
      roleOptionsRef.current,
    );
    if (!canManageTeammates) {
      setFormError("Only editors and admins can add new teammates.");
      return;
    }

    setAddSubmitting(true);
    try {
      if (roleName) {
        const supabase = createSupabaseBrowserClient();
        await ensureContributorRole(supabase, roleName);
      }

      const result = await sendWorkspaceInvite({
        workspace_id: activeWorkspaceId,
        email: form.email.trim(),
        name: form.name.trim(),
        role: roleName ?? undefined,
        permission_level: toStoredPermissionLevel(form.permissionLevel, form.isAdmin),
      });

      if (result.status === "error") {
        setFormError(result.message);
        return;
      }

      if (result.status === "already_member") {
        setFormError(`${form.name.trim() || form.email.trim()} is already a member of this workspace.`);
        showToast(inviteToastMessage(result, form.name.trim(), form.email.trim()));
        return;
      }

      showToast(
        inviteToastMessage(result, form.name.trim(), form.email.trim()),
      );
      setAddOpen(false);
      router.refresh();
    } finally {
      setAddSubmitting(false);
    }
  };

  const updateTeammate = async () => {
    if (!editRow || !form.name.trim() || editRow.isPending || editRow.isPendingInvite) return;
    setFormError(null);
    const supabase = createSupabaseBrowserClient();
    const roleText = resolveRoleTextFromFormValue(
      form.roleId,
      roleOptionsRef.current,
    );
    const roleFields = await resolveContributorRoleFields(supabase, roleText);
    if (!form.isAdmin && editingLastAdmin) {
      setAdminAccessError(LAST_ADMIN_ERROR);
      return;
    }

    const permission_level = toStoredPermissionLevel(form.permissionLevel, form.isAdmin);
    const { data, error } = await supabase
      .from("contributors")
      .update({
        name: form.name.trim(),
        email: form.email.trim() || null,
        role: roleFields.role,
        role_id: roleFields.role_id,
      })
      .eq("id", editRow.id)
      .select(
        "id, name, email, role, role_id, permission_level, is_paid, user_id, contributor_roles(name)",
      )
      .single();
    if (error) {
      setFormError(error.message || "Could not save teammate.");
      return;
    }
    if (!data) {
      setFormError("Could not save teammate.");
      return;
    }

    if (canEditPermission && !editingOwnRow) {
      const contributorUserId = editRow.userId?.trim() || null;
      if (!contributorUserId) {
        console.warn(
          "[teammates] Cannot update workspace_members.permission_level — contributor has no user_id",
          { contributorId: editRow.id },
        );
      } else if (!activeWorkspaceId) {
        console.warn(
          "[teammates] Cannot update workspace_members.permission_level — no active workspace",
        );
      } else {
        const { error: memberError } = await supabase
          .from("workspace_members")
          .update({
            permission_level,
            role: mapWorkspaceMemberRole(permission_level),
          })
          .eq("workspace_id", activeWorkspaceId)
          .eq("user_id", contributorUserId);
        if (memberError) {
          setFormError(memberError.message || "Could not update permission level.");
          return;
        }
      }
    }

    const contributorPermissionPatch =
      canEditPermission && !editingOwnRow
        ? {
            permission_level,
            is_paid: isPaidPermissionLevel(permission_level),
          }
        : { is_paid: isPaidPermissionLevel(permission_level) };
    const { error: paidError } = await supabase
      .from("contributors")
      .update(contributorPermissionPatch)
      .eq("id", editRow.id);
    void paidError;

    const updated = mapTeammateRow(data as Record<string, unknown>);
    upsertTeammate({
      ...updated,
      userId: updated.userId ?? editRow.userId ?? null,
      permissionLevel: form.permissionLevel,
      workspacePermissionLevel: permission_level,
      adminContentPermission: form.isAdmin ? form.permissionLevel : undefined,
      workspaceMemberRole: mapWorkspaceMemberRole(permission_level),
      isAdmin: form.isAdmin,
      isPaid: isPaidPermissionLevel(permission_level),
    });
    setEditRow(null);
    showToast("Changes saved");
    router.refresh();
  };

  const removeTeammate = async () => {
    if (!removeRow) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("contributors").update({ deleted_at: new Date().toISOString() }).eq("id", removeRow.id);
    setTeammates((prev) => prev.filter((row) => row.id !== removeRow.id));
    setSelectedRowId((prev) => (prev === removeRow.id ? null : prev));
    setRemoveRow(null);
    showToast("Changes saved");
  };

  return (
    <>
      <div className={settingsTableLayoutStyles.pageContent} style={{ width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: "var(--text-heading, #6b1e2e)", letterSpacing: "-0.96px" }}>
            Teammates
          </h1>
          {canManageTeammates ? (
            <Button
              label="Teammate"
              icon="leading"
              iconName="plus"
              variant="primary"
              size="sm"
              onClick={openAdd}
            />
          ) : null}
        </div>

        <div className={settingsTableLayoutStyles.tableShell}>
          <div className={settingsTableLayoutStyles.tableScroll}>
            <div
              className={`${settingsTableLayoutStyles.tableScrollInner} ${teammateKebabStyles.teammatesTableScrollInner}`}
            >
            <Table
              layout="auto"
              className={`${settingsTableLayoutStyles.tableBorderless} ${teammateKebabStyles.teammatesTable}`}
            columns={columns}
            rows={pagedRows}
            selectedRowId={selectedRowId ?? undefined}
            onRowClick={(row) => setSelectedRowId(row.id)}
            emptyState={
              <span>
                {noWorkspace
                  ? "No workspace found"
                  : "No teammates yet - add your first teammate to start collaborating."}
              </span>
            }
            pagination={{
            totalCount: total,
            pageSize: effectivePageSize,
            pageIndex: safePage,
            pageSizeOptions: ROWS_PER_PAGE_OPTIONS,
            pageSizeValue: rowsPerPage,
            onPageSizeChange: (size) => {
              setRowsPerPage(size);
              setPage(0);
              try {
                localStorage.setItem(ROWS_PER_PAGE_STORAGE_KEY, String(size));
              } catch {
                /* ignore */
              }
            },
            onPrev: () => setPage((p) => Math.max(0, p - 1)),
            onNext: () => setPage((p) => Math.min(pageCount - 1, p + 1)),
          }}
            />
            </div>
          </div>
        </div>
      </div>

      <Modal
        open={addOpen}
        type="form"
        size="md"
        title="Add Teammate"
        onClose={() => requestCloseForm("add")}
        backdropClosable={!formDirty}
        onEscapeWhenBackdropBlocked={() => {
          setPendingClose("add");
          setDiscardOpen(true);
        }}
        footer={formFooter({
          primaryLabel: "Add Teammate",
          primaryLoading: addSubmitting,
          primaryLoadingLabel: "Sending...",
          primaryDisabled:
            !canManageTeammates ||
            !form.name.trim() ||
            !form.email.trim() ||
            addSubmitting,
          showRequiredFields: true,
          onCancel: () => requestCloseForm("add"),
          onPrimary: () => void createTeammate(),
        })}
      >
        {!canManageTeammates && !permissionLoading ? (
          <Alert
            sentiment="warning"
            prominence="low"
            title="Only editors and admins can add new teammates."
            dismissible={false}
          />
        ) : null}
        {formError && canManageTeammates ? (
          <Alert
            sentiment="warning"
            prominence="low"
            title={formError}
            dismissible={false}
          />
        ) : null}
        <Input
          label="Name"
          placeholder="First and last name"
          value={form.name}
          error={Boolean(nameError)}
          errorMessage={nameError ?? undefined}
          showHelper={false}
          onChange={(e) => {
            setFormError(null);
            setNameError(null);
            setForm((prev) => ({ ...prev, name: e.target.value }));
          }}
          size="sm"
        />
        <Input
          label="Email*"
          value={form.email}
          onChange={(e) => {
            setFormError(null);
            setForm((prev) => ({ ...prev, email: e.target.value }));
          }}
          size="sm"
        />
        <TeammateRoleSelect
          active={addOpen}
          options={addRoleSelectOptions}
          value={form.roleId || undefined}
          onChange={(value) => {
            setFormError(null);
            applyRoleIdToForm(value);
          }}
        />
        <Select
          label="Permission Level"
          options={contentPermissionOptions}
          value={form.permissionLevel}
          onChange={(value) => {
            setFormError(null);
            setForm((prev) => ({
              ...prev,
              permissionLevel: value as ContentPermissionLevel,
            }));
          }}
          placeholder="Select permission"
          size="sm"
          portaled
        />
        <AdminAccessField
          checked={form.isAdmin}
          disabled={false}
          error={null}
          onChange={(checked) => {
            setFormError(null);
            handleAdminAccessChange(checked);
          }}
        />
      </Modal>

      <Modal
        open={Boolean(editRow)}
        type="form"
        size="md"
        title="Edit Teammate"
        onClose={() => requestCloseForm("edit")}
        backdropClosable={!formDirty}
        onEscapeWhenBackdropBlocked={() => {
          setPendingClose("edit");
          setDiscardOpen(true);
        }}
        footer={formFooter({
          primaryLabel: "Save",
          primaryDisabled: !form.name.trim(),
          onCancel: () => requestCloseForm("edit"),
          onPrimary: () => void updateTeammate(),
        })}
      >
        {formError ? (
          <Alert
            sentiment="warning"
            prominence="low"
            title={formError}
            dismissible={false}
          />
        ) : null}
        <Input
          label="Name"
          required
          value={form.name}
          onChange={(e) => {
            setFormError(null);
            setForm((prev) => ({ ...prev, name: e.target.value }));
          }}
          size="sm"
        />
        <Input
          label="Email"
          value={form.email}
          onChange={(e) => {
            setFormError(null);
            setForm((prev) => ({ ...prev, email: e.target.value }));
          }}
          size="sm"
        />
        <TeammateRoleSelect
          active={Boolean(editRow)}
          options={editRoleSelectOptions}
          value={form.roleId || undefined}
          onChange={(value) => {
            setFormError(null);
            applyRoleIdToForm(value);
          }}
        />
        {showPermissionFieldInEdit ? (
          <>
            <Select
              label="Permission Level"
              options={contentPermissionOptions}
              value={form.permissionLevel}
              onChange={(value) => {
                setFormError(null);
                setForm((prev) => ({
                  ...prev,
                  permissionLevel: value as ContentPermissionLevel,
                }));
              }}
              placeholder="Select permission"
              size="sm"
              portaled
            />
            <AdminAccessField
              checked={form.isAdmin}
              disabled={editingLastAdmin && form.isAdmin}
              error={adminAccessError}
              onChange={handleAdminAccessChange}
            />
          </>
        ) : editingOwnRow ? (
          <>
            <Select
              label="Permission Level"
              options={contentPermissionOptions}
              value={form.permissionLevel}
              onChange={() => {}}
              placeholder="Select permission"
              disabled
              size="sm"
              portaled
            />
            <AdminAccessField
              checked={form.isAdmin}
              disabled={true}
              error={null}
              onChange={() => {}}
            />
          </>
        ) : (
          <Tooltip
            label="Only admins can change permission levels."
            position="top"
            passThroughFocus
          >
            <Select
              label="Permission Level"
              options={contentPermissionOptions}
              value={form.permissionLevel}
              onChange={() => {}}
              placeholder="Select permission"
              disabled
              size="sm"
              portaled
            />
          </Tooltip>
        )}
      </Modal>

      <Modal
        open={Boolean(removeRow)}
        type="destructive"
        size="sm"
        className={teammateKebabStyles.removeModal}
        title={`Remove ${removeRow?.name ?? "teammate"} from this workspace?`}
        onClose={() => setRemoveRow(null)}
        footer={formFooter({
          primaryLabel: "Remove",
          primaryVariant: "destructive",
          onCancel: () => setRemoveRow(null),
          onPrimary: () => void removeTeammate(),
        })}
      >
        <p style={{ margin: 0, color: "var(--text/secondary, #6b5e55)", fontSize: 14 }}>
          They will lose access to all projects and reviews.
        </p>
      </Modal>

      <DiscardChangesModal
        open={discardOpen}
        onKeepEditing={() => {
          setDiscardOpen(false);
          setPendingClose(null);
        }}
        onDiscard={() => {
          if (pendingClose === "add") setAddOpen(false);
          if (pendingClose === "edit") setEditRow(null);
          setDiscardOpen(false);
          setPendingClose(null);
        }}
      />
    </>
  );
}

const ADD_TEAMMATE_ROLE_SEARCH_INPUT = 'input[aria-label="Search options"]';
const ADD_TEAMMATE_ROLE_MENU = 'ul[role="listbox"][aria-label="Role"]';

type TeammateRoleSelectProps = {
  active: boolean;
  options: { value: string; label: string }[];
  value?: string;
  onChange: (roleId: string) => void;
};

function TeammateRoleSelect({
  active,
  options,
  value,
  onChange,
}: TeammateRoleSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const confirmTypedRole = useCallback(
    (raw: string) => {
      const typed = raw.trim();
      if (!typed) return;

      const typedKey = typed.toLowerCase();
      const existing = options.find((o) => {
        const label = o.label.trim().toLowerCase();
        const valueKey = cleanRole(o.value).trim().toLowerCase();
        return (
          label === typedKey ||
          valueKey === typedKey ||
          o.value.trim().toLowerCase() === typedKey
        );
      });
      if (existing) {
        onChange(existing.value);
        return;
      }

      const name = titleCaseRoleName(typed);
      if (!name) return;
      onChange(name);
    },
    [options, onChange],
  );

  useEffect(() => {
    if (!active) return;
    const root = rootRef.current;
    if (!root) return;

    const getSearchInput = () =>
      root.querySelector<HTMLInputElement>(ADD_TEAMMATE_ROLE_SEARCH_INPUT);

    const isRoleMenuTarget = (target: Node) => {
      const menu = document.querySelector(ADD_TEAMMATE_ROLE_MENU);
      return menu?.contains(target) ?? false;
    };

    const onPointerDownCapture = (e: PointerEvent) => {
      const target = e.target as Node;
      if (root.contains(target) || isRoleMenuTarget(target)) return;
      const input = getSearchInput();
      if (!input) return;
      confirmTypedRole(input.value);
    };

    const onFocusOutCapture = (e: FocusEvent) => {
      const next = e.relatedTarget as Node | null;
      if (next && (root.contains(next) || isRoleMenuTarget(next))) return;
      const input = getSearchInput();
      if (!input) return;
      confirmTypedRole(input.value);
    };

    const onKeyDownCapture = (e: KeyboardEvent) => {
      const input = getSearchInput();
      if (!input || document.activeElement !== input) return;
      if (e.key !== "Enter" && e.key !== "Tab") return;
      if (!input.value.trim()) return;
      if (e.key === "Enter") e.preventDefault();
      confirmTypedRole(input.value);
    };

    document.addEventListener("pointerdown", onPointerDownCapture, true);
    root.addEventListener("focusout", onFocusOutCapture, true);
    root.addEventListener("keydown", onKeyDownCapture, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDownCapture, true);
      root.removeEventListener("focusout", onFocusOutCapture, true);
      root.removeEventListener("keydown", onKeyDownCapture, true);
    };
  }, [active, confirmTypedRole]);

  return (
    <div ref={rootRef}>
      <Select
        label="Role"
        options={options}
        value={value}
        onChange={onChange}
        placeholder="Select role"
        size="sm"
        searchable
        creatable
        creatableOptionLabel={(typed) => `Add '${typed}'`}
        onCreatableSelect={(typed) => {
          const name = titleCaseRoleName(typed);
          if (!name) return undefined;
          return name;
        }}
        portaled
      />
    </div>
  );
}

function customRoleValue(name: string): string {
  return `${CUSTOM_ROLE_PREFIX}${encodeURIComponent(name.trim())}`;
}

function parseCustomRoleValue(value: string): string | null {
  if (!value.startsWith(CUSTOM_ROLE_PREFIX)) return null;
  try {
    return decodeURIComponent(value.slice(CUSTOM_ROLE_PREFIX.length));
  } catch {
    return null;
  }
}

function cleanRole(value: string): string {
  if (value.startsWith("__role__:")) {
    return decodeURIComponent(value.replace("__role__:", ""));
  }
  return value;
}

function resolveRoleTextFromFormValue(
  value: string,
  options: RoleOption[],
): string | null {
  if (!value.trim()) return null;
  const legacy =
    parseCustomRoleValue(value) ??
    parseWorkspaceRoleValue(value) ??
    null;
  if (legacy) return legacy;
  const trimmed = value.trim();
  const opt = options.find(
    (r) =>
      r.name.toLowerCase() === trimmed.toLowerCase() ||
      r.id === trimmed ||
      r.id.toLowerCase() === trimmed.toLowerCase(),
  );
  if (opt) return opt.name;
  return cleanRole(trimmed) || null;
}

/** Pre-populate edit role from contributors.role plain text (match option casing when known). */
function initialRoleFormValue(row: Teammate, options: RoleOption[]): string {
  const name = row.roleName?.trim();
  if (!name) return "";
  const match = options.find((o) => o.name.toLowerCase() === name.toLowerCase());
  return match?.name ?? name;
}

function sortRoleOptions(roles: RoleOption[]): RoleOption[] {
  return [...roles].sort((a, b) => a.name.localeCompare(b.name));
}

function isPendingMemberRow(row: Teammate): boolean {
  return row.memberStatus?.trim().toLowerCase() === "pending";
}

function teammateStatus(row: Teammate): "active" | "pending" | string {
  const raw = row.memberStatus?.trim().toLowerCase();
  if (raw === "active") return "active";
  if (raw === "pending") return "pending";
  if (row.isPendingInvite || row.isPending) return "pending";
  if (row.userId) return "active";
  if (raw) return raw;
  return "inactive";
}

function displayJobRoleName(roleName: string | null | undefined): string | null {
  const text = roleName?.trim();
  if (!text || text.toLowerCase() === "viewer") return null;
  return text;
}

function resolvePermissionDisplay(row: Teammate): {
  stored: WorkspacePermissionLevel;
  content: ContentPermissionLevel;
} {
  const stored =
    row.workspacePermissionLevel ??
    toStoredPermissionLevel(row.permissionLevel, row.isAdmin);
  if (stored === "admin") {
    return {
      stored,
      content: row.adminContentPermission ?? row.permissionLevel ?? "editor",
    };
  }
  return {
    stored,
    content: stored === "editor" ? "editor" : "reviewer",
  };
}

function mapTeammateRow(raw: Record<string, unknown>): Teammate {
  const { contentPermissionLevel, isAdmin } = normalizeTeammatePermissionFields(
    raw.permission_level,
    raw.is_admin,
  );
  const storedLevel = toStoredPermissionLevel(contentPermissionLevel, isAdmin);
  const roleText = raw.role == null ? null : String(raw.role).trim();
  const roleName =
    roleText && roleText.toLowerCase() !== "viewer" ? roleText : null;
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    email: raw.email == null ? null : String(raw.email),
    roleId: raw.role_id == null ? null : String(raw.role_id),
    roleName,
    permissionLevel: contentPermissionLevel,
    isAdmin,
    isPaid: isPaidPermissionLevel(storedLevel),
    isPending: false,
    userId: raw.user_id == null ? null : String(raw.user_id),
  };
}

function AdminAccessField({
  checked,
  disabled,
  error,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  error: string | null;
  onChange: (checked: boolean) => void;
}) {
  const fieldId = useId();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        marginTop: 16,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          minHeight: 24,
        }}
      >
        <Checkbox
          id={fieldId}
          checked={checked}
          disabled={disabled}
          onChange={onChange}
        />
        <label
          htmlFor={fieldId}
          style={{
            fontSize: 13,
            fontWeight: 500,
            color: "var(--text-primary, #2e1c1c)",
            cursor: disabled ? "not-allowed" : "pointer",
            margin: 0,
            lineHeight: 1,
          }}
        >
          Admin access
        </label>
      </div>
      <p
        style={{
          fontSize: 12,
          color: "var(--text-secondary, #6b5e55)",
          margin: 0,
          paddingLeft: 32,
          lineHeight: 1.5,
        }}
      >
        {ADMIN_ACCESS_HELPER}
      </p>
      {error ? (
        <p
          role="alert"
          style={{
            margin: 0,
            paddingLeft: 32,
            fontSize: 12,
            color: "#8b2020",
            lineHeight: 1.5,
          }}
        >
          {error}
        </p>
      ) : null}
    </div>
  );
}

function labelWorkspacePermission(value: WorkspacePermissionLevel) {
  if (value === "admin") return "Admin";
  if (value === "editor") return "Editor";
  return "Reviewer";
}

function renderWorkspacePermissionPill(level: WorkspacePermissionLevel) {
  return (
    <StatusPill
      label={labelWorkspacePermission(level)}
      color="mushroom"
      appearance="outline"
      size="md"
      labelTypography="body"
      className={[
        teammateKebabStyles.tablePillMd,
        teammateKebabStyles.permissionPill,
      ].join(" ")}
    />
  );
}

function emailInitialForPendingInvite(email: string | null) {
  const local = (email ?? "").split("@")[0]?.trim() ?? "";
  return local[0]?.toUpperCase() ?? "?";
}

function nameInitialsForTeammate(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "U";
  if (parts.length === 1) {
    const w = parts[0];
    const a = w[0]?.toUpperCase() ?? "U";
    const b = w[1]?.toUpperCase() ?? "";
    return b ? `${a}${b}` : a;
  }
  const first = parts[0][0]?.toUpperCase() ?? "";
  const last = parts[parts.length - 1][0]?.toUpperCase() ?? "";
  return `${first}${last}` || "U";
}

function formFooter({
  primaryLabel,
  primaryDisabled,
  primaryLoading,
  primaryLoadingLabel,
  primaryVariant = "primary",
  showRequiredFields = false,
  onCancel,
  onPrimary,
}: {
  primaryLabel: string;
  primaryDisabled?: boolean;
  primaryLoading?: boolean;
  primaryLoadingLabel?: string;
  primaryVariant?: "primary" | "destructive";
  showRequiredFields?: boolean;
  onCancel: () => void;
  onPrimary: () => void;
}) {
  const primaryVariantClass =
    primaryVariant === "destructive" ? "destructive" : "primary";

  return (
    <div
      style={{
        display: "flex",
        width: "100%",
        alignItems: "center",
        justifyContent: showRequiredFields ? "space-between" : "flex-end",
        gap: 8,
      }}
    >
      {showRequiredFields ? (
        <p style={{ margin: 0, fontSize: 12, color: "#998c82", flex: 1 }}>
          * Required fields
        </p>
      ) : null}
      <div style={{ display: "flex", gap: 8, marginLeft: showRequiredFields ? undefined : "auto" }}>
        <Button
          label="Cancel"
          variant="secondary"
          size="sm"
          onClick={onCancel}
          disabled={primaryLoading}
        />
        {primaryLoading ? (
          <button
            type="button"
            className={[
              buttonStyles.root,
              buttonStyles[`variant-${primaryVariantClass}`],
              buttonStyles["size-sm"],
            ].join(" ")}
            disabled
            aria-busy="true"
            aria-label={primaryLoadingLabel ?? primaryLabel}
          >
            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
              <SpinnerIcon size={14} className="animate-spin" />
              {primaryLoadingLabel ?? "Sending..."}
            </span>
          </button>
        ) : (
          <Button
            label={primaryLabel}
            variant={primaryVariant === "destructive" ? "destructive" : "primary"}
            size="sm"
            disabled={primaryDisabled}
            onClick={onPrimary}
          />
        )}
      </div>
    </div>
  );
}

const paidIconWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
