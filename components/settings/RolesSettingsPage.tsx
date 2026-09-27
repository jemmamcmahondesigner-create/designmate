"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Avatar,
  Button,
  IconSquareButton,
  Input,
  Menu,
  MenuItem,
  Modal,
  Table,
  Tooltip,
  type ColumnDef,
} from "@/components/ui/ds";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import settingsTableLayoutStyles from "./settingsTableLayout.module.css";
import rolesTableStyles from "./RolesSettingsPage.module.css";

export type RoleMember = {
  id: string;
  name: string;
};

export type RoleRow = {
  id: string;
  name: string;
  workspaceId: string | null;
  memberCount: number;
  members: RoleMember[];
};

function isBuiltInRole(row: Pick<RoleRow, "workspaceId">): boolean {
  return row.workspaceId == null;
}

function roleWriteError(message: string): string {
  if (/row-level security/i.test(message)) {
    return "Default roles can't be changed. Create a workspace role instead.";
  }
  return message || "Could not save role.";
}

const overflowChipStyle = {
  width: 24,
  height: 24,
  borderRadius: "50%",
  background: "var(--neutral-200, #e4ddd3)",
  color: "var(--text-secondary, #6b5e55)",
  fontSize: 9,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "'Plus Jakarta Sans', sans-serif",
} as const;

export function RolesSettingsPage({
  initialRoles,
  readOnly = false,
  activeWorkspaceId = null,
}: {
  initialRoles: RoleRow[];
  readOnly?: boolean;
  activeWorkspaceId?: string | null;
}) {
  const router = useRouter();
  const [roles, setRoles] = useState(initialRoles);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editRole, setEditRole] = useState<RoleRow | null>(null);
  const [newName, setNewName] = useState("");
  const [editName, setEditName] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const actionRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    setRoles(initialRoles);
  }, [initialRoles]);

  const refresh = () => router.refresh();

  const columns: ColumnDef<RoleRow>[] = [
    {
      key: "title",
      label: "Title",
      width: "flex",
      cellType: "custom",
      render: (row) => (
        <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text-primary, #2e1c1c)" }}>{row.name}</span>
      ),
    },
    {
      key: "members",
      label: "Members",
      cellType: "custom",
      render: (row) => {
        if (row.memberCount === 0) {
          return <span style={{ color: "var(--text/disabled, #c9c0b4)", fontSize: 13 }}>—</span>;
        }
        const show = row.members.slice(0, 3);
        const hidden = row.members.slice(3);
        const rest = hidden.length;
        const hiddenNamesTooltip = hidden.map((member) => member.name).join("\n");
        return (
          <div className="flex flex-row -space-x-1" style={{ alignItems: "center" }}>
            {show.map((member) => (
              <span key={member.id} title={member.name}>
                <Avatar contributorId={member.id} name={member.name} size="sm" />
              </span>
            ))}
            {rest > 0 ? (
              <Tooltip label={hiddenNamesTooltip} position="top" maxWidth={240}>
                <span style={overflowChipStyle}>+{rest}</span>
              </Tooltip>
            ) : null}
          </div>
        );
      },
    },
    {
      key: "state",
      label: "State",
      width: 120,
      cellType: "text",
      render: (row) => (isBuiltInRole(row) ? "Default" : "Custom"),
    },
    ...(readOnly
      ? []
      : [
          {
            key: "actions",
            label: "",
            width: 40,
            cellType: "kebab" as const,
            render: (row: RoleRow) =>
              isBuiltInRole(row) ? null : (
              <>
                <IconSquareButton
                  ref={(el) => {
                    actionRefs.current[row.id] = el;
                  }}
                  variant="ghost"
                  icon="kebab"
                  label="Role actions"
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
                  <MenuItem
                    label="Edit"
                    onClick={() => {
                      setOpenMenuId(null);
                      setEditRole(row);
                      setEditName(row.name);
                      setFormError(null);
                    }}
                  />
                  <MenuItem
                    label="Remove"
                    destructive
                    onClick={() => {
                      setOpenMenuId(null);
                      void removeRole(row);
                    }}
                  />
                </Menu>
              </>
            ),
          },
        ]),
  ];

  const createRole = async () => {
    const name = newName.trim();
    if (!name) return;
    if (!activeWorkspaceId) {
      setFormError("Select a workspace before creating a role.");
      return;
    }
    setFormError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase
      .from("contributor_roles")
      .insert({ name, workspace_id: activeWorkspaceId });
    if (error) {
      setFormError(roleWriteError(error.message));
      return;
    }
    setAddOpen(false);
    setNewName("");
    refresh();
  };

  const saveEdit = async () => {
    if (!editRole) return;
    if (isBuiltInRole(editRole)) {
      setFormError("Default roles can't be changed. Create a workspace role instead.");
      return;
    }
    const name = editName.trim();
    if (!name) return;
    setFormError(null);
    const supabase = createSupabaseBrowserClient();
    const oldName = editRole.name;
    const { error: uErr } = await supabase.from("contributor_roles").update({ name }).eq("id", editRole.id);
    if (uErr) {
      setFormError(roleWriteError(uErr.message));
      return;
    }
    if (oldName !== name && activeWorkspaceId) {
      await supabase
        .from("contributors")
        .update({ role: name })
        .eq("role", oldName)
        .eq("workspace_id", activeWorkspaceId);
      await supabase
        .from("contributors")
        .update({ role: name })
        .eq("role_id", editRole.id)
        .eq("workspace_id", activeWorkspaceId);
    }
    setEditRole(null);
    refresh();
  };

  const removeRole = async (row: RoleRow) => {
    if (isBuiltInRole(row)) {
      setFormError("Default roles can't be changed. Create a workspace role instead.");
      return;
    }
    const supabase = createSupabaseBrowserClient();
    if (activeWorkspaceId) {
      await supabase
        .from("contributors")
        .update({ role: null, role_id: null })
        .eq("role", row.name)
        .eq("workspace_id", activeWorkspaceId);
      await supabase
        .from("contributors")
        .update({ role_id: null })
        .eq("role_id", row.id)
        .eq("workspace_id", activeWorkspaceId);
    }
    const { error } = await supabase.from("contributor_roles").delete().eq("id", row.id);
    if (error) {
      setFormError(roleWriteError(error.message));
      return;
    }
    refresh();
  };

  return (
    <div className={settingsTableLayoutStyles.pageContent}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: "var(--text-heading, #6b1e2e)" }}>Roles</h1>
        {!readOnly ? (
          <Button
            label="New Role"
            variant="primary"
            size="sm"
            icon="leading"
            iconName="plus"
            onClick={() => {
              setFormError(null);
              setNewName("");
              setAddOpen(true);
            }}
          />
        ) : null}
      </div>
      {formError ? (
        <div style={{ margin: "0 0 12px" }}>
          <Alert sentiment="warning" prominence="low" title={formError} dismissible={false} />
        </div>
      ) : null}
      <div
        className={settingsTableLayoutStyles.tableShell}
        style={{ minWidth: 0, width: "100%" }}
      >
        <div className={settingsTableLayoutStyles.tableScroll}>
          <div className={settingsTableLayoutStyles.tableScrollInner}>
            <Table
              className={`${settingsTableLayoutStyles.tableBorderless} ${rolesTableStyles.rolesTable}`}
              columns={columns}
              rows={roles}
              emptyState={<span>No roles</span>}
            />
          </div>
        </div>
      </div>

      <Modal
        open={addOpen}
        type="form"
        size="sm"
        title="Create Role"
        onClose={() => setAddOpen(false)}
        footer={
          <div style={{ display: "flex", width: "100%", justifyContent: "flex-end", gap: 8 }}>
            <Button label="Cancel" variant="secondary" size="sm" onClick={() => setAddOpen(false)} />
            <Button label="Save" variant="primary" size="sm" disabled={!newName.trim()} onClick={() => void createRole()} />
          </div>
        }
      >
        {formError ? (
          <Alert sentiment="warning" prominence="low" title={formError} dismissible={false} />
        ) : null}
        <Input label="Name" required value={newName} onChange={(e) => setNewName(e.target.value)} size="sm" />
      </Modal>

      <Modal
        open={Boolean(editRole)}
        type="form"
        size="sm"
        title="Edit Role"
        onClose={() => setEditRole(null)}
        footer={
          <div style={{ display: "flex", width: "100%", justifyContent: "flex-end", gap: 8 }}>
            <Button label="Cancel" variant="secondary" size="sm" onClick={() => setEditRole(null)} />
            <Button label="Save" variant="primary" size="sm" disabled={!editName.trim()} onClick={() => void saveEdit()} />
          </div>
        }
      >
        {formError ? (
          <Alert sentiment="warning" prominence="low" title={formError} dismissible={false} />
        ) : null}
        <Input label="Name" required value={editName} onChange={(e) => setEditName(e.target.value)} size="sm" />
      </Modal>
    </div>
  );
}
