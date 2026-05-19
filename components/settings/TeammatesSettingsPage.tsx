"use client";

import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { DiscardChangesModal } from "@/components/DiscardChangesModal";
import { useToast } from "@/components/Toast";
import {
  Button,
  Icon,
  IconSquareButton,
  Input,
  Menu,
  MenuItem,
  Modal,
  Select,
  Table,
  Tag,
  type ColumnDef,
} from "@/components/ui/ds";
import { useRouter } from "next/navigation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { sendWorkspaceInvite } from "@/lib/workspace/invite-client";
import { inviteToastMessage } from "@/lib/workspace/invite-toast";

type Teammate = {
  id: string;
  name: string;
  email: string | null;
  roleId: string | null;
  roleName: string | null;
  permissionLevel: "admin" | "editor" | "reviewer";
  isPaid: boolean;
  isPending?: boolean;
  memberId?: string;
};

type RoleOption = { id: string; name: string };

type FormState = {
  name: string;
  email: string;
  roleId: string;
  permissionLevel: "admin" | "editor" | "reviewer";
};

const PAGE_SIZE = 10;

/** Designer → editor; any other role → reviewer */
function permissionLevelFromRoleName(roleName: string | null | undefined): "editor" | "reviewer" {
  const n = String(roleName ?? "").trim().toLowerCase();
  return n === "designer" ? "editor" : "reviewer";
}

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
  const [selectedRowId, setSelectedRowId] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const { showToast } = useToast();
  /** Client-only overlay (browser fetch + newly created roles). Always merged with `initialContributorRoles` for the Select. */
  const [roleOptions, setRoleOptions] = useState<RoleOption[]>([]);
  const roleOptionsRef = useRef<RoleOption[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const router = useRouter();

  const [addOpen, setAddOpen] = useState(false);
  const [editRow, setEditRow] = useState<Teammate | null>(null);
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
    if (!activeWorkspaceId) return;
    const supabase = createSupabaseBrowserClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", activeWorkspaceId)
        .eq("user_id", user.id)
        .maybeSingle();
      setIsAdmin(String((data as { role?: string } | null)?.role ?? "") === "admin");
    })();
  }, [activeWorkspaceId]);

  useEffect(() => {
    let cancelled = false;
    const loadRoles = async () => {
      if (process.env.NODE_ENV === "development") {
        console.log("fetching roles");
      }
      const supabase = createSupabaseBrowserClient();
      const { data, error } = await supabase
        .from("contributor_roles")
        .select("id, name")
        .order("name", { ascending: true });
      if (process.env.NODE_ENV === "development") {
        console.log("contributor_roles result:", data, error);
      }
      if (error) {
        console.error("Roles fetch error:", error);
        return;
      }
      const mapped =
        data?.map((row) => {
          const o = row as Record<string, unknown>;
          return { id: String(o.id ?? ""), name: String(o.name ?? "") };
        }).filter((r) => r.id.trim() !== "" && r.name.trim() !== "") ?? [];
      if (cancelled) return;
      setRoleOptions(sortRoleOptions(mapped));
    };
    void loadRoles();
    return () => {
      cancelled = true;
    };
  }, [addOpen, editRow]);

  const actionRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  const total = teammates.length;
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const start = safePage * PAGE_SIZE;
  const pagedRows = teammates.slice(start, start + PAGE_SIZE);
  const end = Math.min(start + PAGE_SIZE, total);

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
        form.roleId !== (editRow.roleId ?? "")
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

  useLayoutEffect(() => {
    roleOptionsRef.current = mergedRoleOptions;
  }, [mergedRoleOptions]);

  useEffect(() => {
    if (process.env.NODE_ENV === "development") {
      console.log("roleSelectOptions (for Role Select):", roleSelectOptions);
    }
  }, [roleSelectOptions]);

  const handleCreateRoleOption = async (typed: string): Promise<string | undefined> => {
    const name = titleCaseRoleName(typed);
    if (!name) return undefined;
    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase.from("contributor_roles").insert({ name }).select("id").single();
    if (!error && data && typeof data === "object" && "id" in data) {
      const id = String((data as Record<string, unknown>).id ?? "");
      if (id) {
        setRoleOptions((prev) => {
          const next = sortRoleOptions([...prev.filter((r) => r.id !== id), { id, name }]);
          roleOptionsRef.current = next;
          return next;
        });
        return id;
      }
    }
    if (error && String((error as { code?: string }).code) === "23505") {
      const { data: existing } = await supabase.from("contributor_roles").select("id, name").eq("name", name).maybeSingle();
      if (existing && typeof existing === "object" && "id" in existing) {
        const id = String((existing as Record<string, unknown>).id ?? "");
        const label = String((existing as Record<string, unknown>).name ?? name);
        if (id) {
          setRoleOptions((prev) => {
            const next = prev.some((r) => r.id === id)
              ? sortRoleOptions(prev)
              : sortRoleOptions([...prev, { id, name: label }]);
            roleOptionsRef.current = next;
            return next;
          });
          return id;
        }
      }
    }
    return undefined;
  };

  const columns: ColumnDef<Teammate>[] = [
    {
      key: "avatar",
      label: "",
      width: 56,
      cellType: "avatar",
      render: (row) => (
        <div style={teammateAvatarStyle}>{nameInitialsForTeammate(row.name)}</div>
      ),
    },
    {
      key: "name",
      label: "Name",
      width: "flex",
      cellType: "text-bold",
      render: (row) => row.name,
    },
    {
      key: "role",
      label: "Role",
      width: "flex",
      cellType: "text",
      render: (row) => row.roleName ?? "—",
    },
    {
      key: "email",
      label: "Email Address",
      width: "flex",
      cellType: "custom",
      render: (row) =>
        row.email ? (
          <a href={`mailto:${row.email}`} className="text-link">
            {row.email}
          </a>
        ) : (
          <span style={{ color: "var(--text-disabled, #c9c0b4)", fontSize: 13 }}>—</span>
        ),
    },
    {
      key: "permission",
      label: "Permission",
      width: "flex",
      cellType: "status",
      render: (row) =>
        row.isPending ? (
          <Tag label="Pending" variant="neutral" size="sm" />
        ) : (
          <span style={permissionPillStyle}>{labelPermission(row.permissionLevel)}</span>
        ),
    },
    {
      key: "paid",
      label: "Paid",
      width: 59,
      cellType: "badge",
      render: (row) =>
        row.isPaid ? (
          <span style={paidIconWrapStyle}>
            <Icon name="check-circle-fill" size={16} aria-hidden />
          </span>
        ) : null,
    },
    {
      key: "actions",
      label: "",
      width: 40,
      cellType: "kebab",
      render: (row) =>
        row.isPending ? null : (
          <>
            <IconSquareButton
              ref={(el) => {
                actionRefs.current[row.id] = el;
              }}
              variant="ghost"
              icon="kebab"
              label="Teammate actions"
              onClick={() => setOpenMenuId((prev) => (prev === row.id ? null : row.id))}
            />
            <Menu
              open={openMenuId === row.id}
              onClose={() => setOpenMenuId(null)}
              anchorRef={{ current: actionRefs.current[row.id] as HTMLElement | null }}
              align="left"
              portal
              portalZIndex={100}
            >
              <MenuItem label="Edit" onClick={() => openEdit(row)} />
              <MenuItem
                label="Remove"
                onClick={() => {
                  setOpenMenuId(null);
                  setRemoveRow(row);
                }}
              />
            </Menu>
          </>
        ),
    },
  ];

  const permissionOptions = [
    { value: "admin", label: "Admin" },
    { value: "editor", label: "Editor" },
    { value: "reviewer", label: "Reviewer" },
  ];

  const openAdd = () => {
    setFormError(null);
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
    const name = roleOptionsRef.current.find((r) => r.id === roleId)?.name ?? null;
    setForm((prev) => ({
      ...prev,
      roleId,
      permissionLevel: permissionLevelFromRoleName(name),
    }));
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
    if (!form.name.trim() || !form.email.trim()) return;
    setFormError(null);
    if (!activeWorkspaceId) {
      setFormError("No workspace found. Complete onboarding to add teammates.");
      return;
    }

    const roleName = roleOptionsRef.current.find((r) => r.id === form.roleId)?.name ?? null;
    const result = await sendWorkspaceInvite({
      workspace_id: activeWorkspaceId,
      email: form.email.trim(),
      name: form.name.trim(),
      role: roleName ?? "member",
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
  };

  const updateTeammate = async () => {
    if (!editRow || !form.name.trim() || editRow.isPending) return;
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

    if (isAdmin && editRow.memberId) {
      const workspaceMemberRole = permission_level === "admin" ? "admin" : "member";
      await supabase
        .from("workspace_members")
        .update({ role: workspaceMemberRole })
        .eq("id", editRow.memberId);
    }

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
          <Button label="+ Teammate" variant="primary" size="sm" onClick={openAdd} />
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
            pageSize: PAGE_SIZE,
            pageIndex: safePage,
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
          primaryDisabled: !form.name.trim() || !form.email.trim(),
          onCancel: () => requestCloseForm("add"),
          onPrimary: () => void createTeammate(),
        })}
      >
        {formError ? (
          <p role="alert" style={{ margin: 0, fontSize: 13, color: "#8b2020" }}>
            {formError}
          </p>
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
          <p role="alert" style={{ margin: 0, fontSize: 13, color: "#8b2020" }}>
            {formError}
          </p>
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
          disabled={!isAdmin}
          size="sm"
        />
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

function sortRoleOptions(roles: RoleOption[]): RoleOption[] {
  return [...roles].sort((a, b) => a.name.localeCompare(b.name));
}

function titleCaseRoleName(raw: string): string {
  return raw
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}

function mapTeammateRow(raw: Record<string, unknown>): Teammate {
  const roleJoin = raw.contributor_roles as { name?: string } | null;
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    email: raw.email == null ? null : String(raw.email),
    roleId: raw.role_id == null ? null : String(raw.role_id),
    roleName: roleJoin?.name ?? (raw.role == null ? null : String(raw.role)),
    permissionLevel: normalizePermission(raw.permission_level),
    isPaid: raw.is_paid == null ? true : Boolean(raw.is_paid),
  };
}

function normalizePermission(value: unknown): Teammate["permissionLevel"] {
  const normalized = String(value ?? "editor").toLowerCase();
  if (normalized === "admin" || normalized === "reviewer") return normalized;
  return "editor";
}

function labelPermission(value: Teammate["permissionLevel"]) {
  return value.charAt(0).toUpperCase() + value.slice(1);
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
  primaryVariant = "primary",
  onCancel,
  onPrimary,
}: {
  primaryLabel: string;
  primaryDisabled?: boolean;
  primaryVariant?: "primary" | "destructive";
  onCancel: () => void;
  onPrimary: () => void;
}) {
  return (
    <div style={{ display: "flex", width: "100%", justifyContent: "flex-end", gap: 8 }}>
      <Button label="Cancel" variant="secondary" size="sm" onClick={onCancel} />
      <Button label={primaryLabel} variant={primaryVariant === "destructive" ? "destructive" : "primary"} size="sm" disabled={primaryDisabled} onClick={onPrimary} />
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

const permissionPillStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  boxSizing: "border-box",
  padding: "6px 12px",
  borderRadius: 9999,
  background: "var(--neutral-0, #ffffff)",
  border: "1px solid var(--border-default, #e4ddd3)",
  fontSize: 12,
  fontWeight: 400,
  lineHeight: 1.5,
  color: "var(--text-secondary, #6b5e55)",
  fontFamily: "'Plus Jakarta Sans', sans-serif",
};

const paidIconWrapStyle: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
};
