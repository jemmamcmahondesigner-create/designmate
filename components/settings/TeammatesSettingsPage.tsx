"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import teammateKebabStyles from "./TeammatesSettingsPage.module.css";
import { DiscardChangesModal } from "@/components/DiscardChangesModal";
import { SpinnerIcon } from "@/components/auth/SpinnerIcon";
import buttonStyles from "@/components/ui/ds/Button.module.css";
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
  Select,
  StatusPill,
  Table,
  Tag,
  Tooltip,
  type ColumnDef,
  type TablePageSizeOption,
} from "@/components/ui/ds";
import {
  ensureContributorRole,
  fetchWorkspaceRoleOptions,
  titleCaseRoleName,
} from "@/lib/workspace/contributorRoles";
import { useRouter } from "next/navigation";
import { useWorkspacePermission } from "@/hooks/useWorkspacePermission";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cancelWorkspaceInvite, sendWorkspaceInvite } from "@/lib/workspace/invite-client";
import { inviteToastMessage } from "@/lib/workspace/invite-toast";
import {
  canAddTeammates,
  canEditTeammatePermission,
  canShowTeammateKebabMenu,
  isOwnTeammateRow,
  isPaidPermissionLevel,
  normalizeWorkspacePermission,
} from "@/lib/workspace/permissions";

type Teammate = {
  id: string;
  name: string;
  email: string | null;
  roleId: string | null;
  roleName: string | null;
  permissionLevel: "admin" | "editor" | "reviewer";
  isPaid: boolean;
  isPending?: boolean;
  isPendingInvite?: boolean;
  inviteCode?: string;
  memberId?: string;
  userId?: string | null;
};

const NAME_REQUIRED_MESSAGE = "Please enter the teammate's first and last name.";
const CUSTOM_ROLE_PREFIX = "__custom__:";

type RoleOption = { id: string; name: string };

type FormState = {
  name: string;
  email: string;
  roleId: string;
  permissionLevel: "admin" | "editor" | "reviewer";
};

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

const PERMISSION_TOOLTIPS: Record<Teammate["permissionLevel"], string> = {
  admin:
    "Full access. Can manage teammates, projects, reviews, and workspace settings.",
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
  const [nameError, setNameError] = useState<string | null>(null);
  const router = useRouter();
  const { permissionLevel, userId: currentUserId, loading: permissionLoading } =
    useWorkspacePermission(activeWorkspaceId);
  const canManageTeammates = canAddTeammates(permissionLevel);
  const canEditPermission = canEditTeammatePermission(permissionLevel);

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
  });

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
        form.roleId !== (editRow.roleId ?? "") ||
        form.permissionLevel !== editRow.permissionLevel
      );
    }
    return false;
  }, [addOpen, editRow, form]);

  const mergedRoleOptions = useMemo(() => {
    const byId = new Map<string, RoleOption>();
    for (const r of initialContributorRoles) {
      if (r.id.trim() !== "" && r.name.trim() !== "") byId.set(r.id, r);
    }
    for (const r of roleOptions) {
      if (r.id.trim() !== "" && r.name.trim() !== "") byId.set(r.id, r);
    }
    return sortRoleOptions([...byId.values()]);
  }, [initialContributorRoles, roleOptions]);

  const roleSelectOptions = useMemo(
    () => mergedRoleOptions.map((role) => ({ value: role.id, label: role.name })),
    [mergedRoleOptions],
  );

  const addRoleSelectOptions = useMemo(() => {
    const opts = [...roleSelectOptions];
    const customLabel = form.roleId ? parseCustomRoleValue(form.roleId) : null;
    if (customLabel && !opts.some((o) => o.value === form.roleId)) {
      opts.push({ value: form.roleId, label: customLabel });
    }
    return opts;
  }, [roleSelectOptions, form.roleId]);

  useLayoutEffect(() => {
    roleOptionsRef.current = mergedRoleOptions;
  }, [mergedRoleOptions]);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.log("roleSelectOptions (for Role Select):", roleSelectOptions);
    }
  }, [roleSelectOptions]);

  const mergeRoleIntoOptions = (id: string, name: string) => {
    setRoleOptions((prev) => {
      const next = sortRoleOptions([...prev.filter((r) => r.id !== id), { id, name }]);
      roleOptionsRef.current = next;
      return next;
    });
  };

  const handleCreateRoleOption = async (typed: string): Promise<string | undefined> => {
    const supabase = createSupabaseBrowserClient();
    const created = await ensureContributorRole(supabase, typed);
    if (!created) return undefined;
    mergeRoleIntoOptions(created.id, created.name);
    return created.id;
  };

  const resendInvite = async (row: Teammate) => {
    if (!row.isPendingInvite || !row.email?.trim() || !activeWorkspaceId) return;
    setOpenMenuId(null);
    const result = await sendWorkspaceInvite({
      workspace_id: activeWorkspaceId,
      email: row.email.trim(),
      permission_level: row.permissionLevel,
    });
    if (result.status === "error") {
      showToast(result.message);
      return;
    }
    showToast(`Invite resent to ${row.email.trim()}`);
    router.refresh();
  };

  const cancelInvite = async (row: Teammate) => {
    if (!row.isPendingInvite || !row.inviteCode) return;
    setOpenMenuId(null);
    const result = await cancelWorkspaceInvite(row.inviteCode);
    if (!result.success) {
      showToast(result.message ?? "Could not cancel invite.");
      return;
    }
    setTeammates((prev) => prev.filter((item) => item.id !== row.id));
    setSelectedRowId((prev) => (prev === row.id ? null : prev));
    showToast("Invite cancelled");
  };

  const columns: ColumnDef<Teammate>[] = [
    {
      key: "avatar",
      label: "",
      width: 56,
      cellType: "avatar",
      render: (row) => (
        <div
          style={
            row.isPendingInvite ? pendingInviteAvatarStyle : teammateAvatarStyle
          }
        >
          {row.isPendingInvite
            ? row.name.trim()
              ? nameInitialsForTeammate(row.name)
              : emailInitialForPendingInvite(row.email)
            : nameInitialsForTeammate(row.name)}
        </div>
      ),
    },
    {
      key: "name",
      label: "Name",
      width: "flex",
      cellType: "text-bold",
      render: (row) =>
        row.isPendingInvite ? (
          row.name.trim() ? (
            row.name
          ) : (
            <span style={invitedUserPlaceholderStyle}>Invited user</span>
          )
        ) : (
          row.name
        ),
    },
    {
      key: "role",
      label: "Role",
      width: "flex",
      cellType: "text",
      render: (row) =>
        row.roleName?.trim() ? (
          row.roleName
        ) : (
          <span style={EMPTY_CELL_STYLE}>—</span>
        ),
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
      width: "flex",
      cellType: "status",
      render: (row) =>
        row.isPending && !row.isPendingInvite ? (
          <Tag label="Pending" variant="neutral" size="sm" />
        ) : (
          <Tooltip
            label={PERMISSION_TOOLTIPS[row.permissionLevel]}
            position="top"
            passThroughFocus
          >
            <span className={teammateKebabStyles.cellPillWrap} tabIndex={0}>
              {renderPermissionPill(row.permissionLevel)}
            </span>
          </Tooltip>
        ),
    },
    {
      key: "status",
      label: "Status",
      width: "flex",
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
        return (
          <StatusPill
            label="Inactive"
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
      width: 59,
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
      width: 40,
      align: "center",
      cellType: "custom",
      render: (row) => {
        const isOwnRow = isOwnTeammateRow(row.userId, currentUserId);
        const showKebab = row.isPendingInvite
          ? canManageTeammates
          : !row.isPending &&
            canShowTeammateKebabMenu(permissionLevel, {
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
              {row.isPendingInvite ? (
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

  const permissionOptions = [
    { value: "reviewer", label: "Reviewer" },
    { value: "editor", label: "Editor" },
    { value: "admin", label: "Admin" },
  ];

  const openAdd = () => {
    setAddSubmitting(false);
    setFormError(null);
    setNameError(null);
    setForm({ name: "", email: "", roleId: "", permissionLevel: "reviewer" });
    setAddOpen(true);
  };

  const openEdit = (row: Teammate) => {
    setFormError(null);
    const roleName = row.roleName ?? null;
    setForm({
      name: row.name,
      email: row.email ?? "",
      roleId: row.roleId ?? "",
      permissionLevel: row.permissionLevel,
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
    if (!activeWorkspaceId) {
      setFormError("No workspace found. Complete onboarding to add teammates.");
      return;
    }

    const customRole = parseCustomRoleValue(form.roleId);
    const roleName =
      customRole ??
      roleOptionsRef.current.find((r) => r.id === form.roleId)?.name ??
      null;
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
        permission_level: form.permissionLevel,
      });

      if (result.status === "error") {
        setFormError(result.message);
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
    const roleName = roleOptionsRef.current.find((r) => r.id === form.roleId)?.name ?? null;
    const permission_level = form.permissionLevel;
    const { data, error } = await supabase
      .from("contributors")
      .update({
        name: form.name.trim(),
        email: form.email.trim() || null,
        role: roleName ?? null,
        role_id: form.roleId || null,
        permission_level,
      })
      .eq("id", editRow.id)
      .select("id, name, email, role, role_id, permission_level, is_paid, contributor_roles(name)")
      .single();
    if (error) {
      setFormError(error.message || "Could not save teammate.");
      return;
    }
    if (!data) {
      setFormError("Could not save teammate.");
      return;
    }

    if (canEditPermission && !editingOwnRow && editRow.memberId) {
      const workspaceMemberRole = permission_level === "admin" ? "admin" : "member";
      await supabase
        .from("workspace_members")
        .update({ role: workspaceMemberRole })
        .eq("id", editRow.memberId);
    }

    const { error: paidError } = await supabase
      .from("contributors")
      .update({ is_paid: isPaidPermissionLevel(permission_level) })
      .eq("id", editRow.id);
    void paidError;

    upsertTeammate(mapTeammateRow(data as Record<string, unknown>));
    setEditRow(null);
    showToast("Changes saved");
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
      <div style={{ width: "100%" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 12 }}>
            <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: "var(--text-heading, #6b1e2e)", letterSpacing: "-0.96px" }}>
              Teammates
            </h1>
            <p style={{ margin: 0, fontSize: 15, color: "var(--text-secondary, #6b5e55)" }}>
              Vital for working towards project goals and contributing to reviews.
            </p>
          </div>
          {canManageTeammates ? (
            <Button label="+ Teammate" variant="primary" size="sm" onClick={openAdd} />
          ) : null}
        </div>

        <Table
          columns={columns}
          rows={pagedRows}
          selectedRowId={selectedRowId ?? undefined}
          onRowClick={(row) => setSelectedRowId(row.id)}
          emptyState={
            <span style={{ color: "var(--text/secondary, #6b5e55)" }}>
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
        <Select
          label="Role"
          options={addRoleSelectOptions}
          value={form.roleId || undefined}
          onChange={(value) => {
            setFormError(null);
            applyRoleIdToForm(value);
          }}
          placeholder="Select role"
          size="sm"
          searchable
          creatable
          creatableOptionLabel={(typed) => `Add '${typed}'`}
          onCreatableSelect={(typed) => {
            const name = titleCaseRoleName(typed);
            if (!name) return undefined;
            return customRoleValue(name);
          }}
          portaled
        />
        <Select
          label="Permission Level"
          options={permissionOptions}
          value={form.permissionLevel}
          onChange={(value) => {
            setFormError(null);
            setForm((prev) => ({
              ...prev,
              permissionLevel: value as "admin" | "editor" | "reviewer",
            }));
          }}
          placeholder="Select permission"
          size="sm"
          portaled
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
        <Select
          label="Role"
          options={roleSelectOptions}
          value={form.roleId || undefined}
          onChange={(value) => {
            setFormError(null);
            applyRoleIdToForm(value);
          }}
          placeholder="Select role"
          size="sm"
          searchable={false}
          creatable
          onCreateOption={handleCreateRoleOption}
          portaled
        />
        {showPermissionFieldInEdit ? (
          <Select
            label="Permission Level"
            options={permissionOptions}
            value={form.permissionLevel}
            onChange={(value) => {
              setFormError(null);
              setForm((prev) => ({
                ...prev,
                permissionLevel: value as "admin" | "editor" | "reviewer",
              }));
            }}
            placeholder="Select permission"
            size="sm"
          />
        ) : editingOwnRow ? null : (
          <Tooltip
            label="Only admins can change permission levels."
            position="top"
            passThroughFocus
          >
            <Select
              label="Permission Level"
              options={permissionOptions}
              value={form.permissionLevel}
              onChange={() => {}}
              placeholder="Select permission"
              disabled
              size="sm"
            />
          </Tooltip>
        )}
      </Modal>

      <Modal
        open={Boolean(removeRow)}
        type="destructive"
        size="sm"
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

function sortRoleOptions(roles: RoleOption[]): RoleOption[] {
  return [...roles].sort((a, b) => a.name.localeCompare(b.name));
}

function teammateStatus(row: Teammate): "active" | "pending" | "inactive" {
  if (row.userId) return "active";
  if (row.isPendingInvite) return "pending";
  return "inactive";
}

function mapTeammateRow(raw: Record<string, unknown>): Teammate {
  const roleJoin = raw.contributor_roles as { name?: string } | null;
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    email: raw.email == null ? null : String(raw.email),
    roleId: raw.role_id == null ? null : String(raw.role_id),
    roleName: roleJoin?.name ?? (raw.role == null ? null : String(raw.role)),
    permissionLevel: normalizeWorkspacePermission(raw.permission_level),
    isPaid: isPaidPermissionLevel(normalizeWorkspacePermission(raw.permission_level)),
    userId: raw.user_id == null ? null : String(raw.user_id),
  };
}

function labelPermission(value: Teammate["permissionLevel"]) {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function renderPermissionPill(level: Teammate["permissionLevel"]) {
  return (
    <StatusPill
      label={labelPermission(level)}
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

const teammateAvatarStyle: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: "50%",
  background: "var(--brand-primary-subtle, #f5eaec)",
  color: "var(--text-heading, #6b1e2e)",
  fontSize: 10,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "'Plus Jakarta Sans', sans-serif",
};

const pendingInviteAvatarStyle: CSSProperties = {
  ...teammateAvatarStyle,
  background: "var(--neutral-200, #e8e4df)",
  color: "var(--text-secondary, #6b5e55)",
};

const invitedUserPlaceholderStyle: CSSProperties = {
  color: "var(--text-tertiary, #998c82)",
  fontSize: 13,
};

const paidIconWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
