"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useRouter } from "next/navigation";
import {
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

export type RoleRow = {
  id: string;
  name: string;
  memberCount: number;
  memberNames: string[];
};

const BUILTIN = new Set(["Designer", "Engineer", "Product Manager", "Stakeholder"]);

function nameInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) {
    const w = parts[0];
    const a = w[0]?.toUpperCase() ?? "?";
    const b = w[1]?.toUpperCase() ?? "";
    return b ? `${a}${b}` : a;
  }
  const first = parts[0][0]?.toUpperCase() ?? "";
  const last = parts[parts.length - 1][0]?.toUpperCase() ?? "";
  return `${first}${last}` || "?";
}

const chipStyle: CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: "50%",
  background: "var(--brand-primary-subtle, #f5eaec)",
  color: "var(--text-heading, #6b1e2e)",
  fontSize: 9,
  fontWeight: 600,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontFamily: "'Plus Jakarta Sans', sans-serif",
};

const overflowChipStyle: CSSProperties = {
  ...chipStyle,
  background: "var(--neutral-200, #e4ddd3)",
  color: "var(--text-secondary, #6b5e55)",
};

export function RolesSettingsPage({ initialRoles }: { initialRoles: RoleRow[] }) {
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
      width: 160,
      cellType: "custom",
      render: (row) => {
        if (row.memberCount === 0) {
          return <span style={{ color: "var(--text-tertiary, #998c82)", fontSize: 13 }}>—</span>;
        }
        const show = row.memberNames.slice(0, 3);
        const rest = row.memberCount - show.length;
        return (
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            {show.map((n, i) => (
              <span key={`${row.id}-m-${i}-${n}`} style={chipStyle} title={n}>
                {nameInitials(n)}
              </span>
            ))}
            {rest > 0 ? (
              <span style={overflowChipStyle} title={`${rest} more`}>
                +{rest}
              </span>
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
      render: (row) => (BUILTIN.has(row.name) ? "Default" : ""),
    },
    {
      key: "actions",
      label: "",
      width: 40,
      cellType: "kebab",
      render: (row) => (
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
            align="left"
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
            {BUILTIN.has(row.name) ? (
              <Tooltip label="Default roles cannot be removed." position="left" fullWidth>
                <span style={{ display: "block" }}>
                  <MenuItem label="Remove" disabled />
                </span>
              </Tooltip>
            ) : (
              <MenuItem
                label="Remove"
                destructive
                onClick={() => {
                  setOpenMenuId(null);
                  void removeRole(row);
                }}
              />
            )}
          </Menu>
        </>
      ),
    },
  ];

  const createRole = async () => {
    const name = newName.trim();
    if (!name) return;
    setFormError(null);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("contributor_roles").insert({ name });
    if (error) {
      setFormError(error.message || "Could not create role.");
      return;
    }
    setAddOpen(false);
    setNewName("");
    refresh();
  };

  const saveEdit = async () => {
    if (!editRole) return;
    const name = editName.trim();
    if (!name) return;
    setFormError(null);
    const supabase = createSupabaseBrowserClient();
    const oldName = editRole.name;
    const { error: uErr } = await supabase.from("contributor_roles").update({ name }).eq("id", editRole.id);
    if (uErr) {
      setFormError(uErr.message || "Could not update role.");
      return;
    }
    if (oldName !== name) {
      await supabase.from("contributors").update({ role: name }).eq("role", oldName);
      await supabase.from("contributors").update({ role: name }).eq("role_id", editRole.id);
    }
    setEditRole(null);
    refresh();
  };

  const removeRole = async (row: RoleRow) => {
    if (BUILTIN.has(row.name)) return;
    const supabase = createSupabaseBrowserClient();
    await supabase.from("contributors").update({ role: null, role_id: null }).eq("role", row.name);
    await supabase.from("contributors").update({ role_id: null }).eq("role_id", row.id);
    const { error } = await supabase.from("contributor_roles").delete().eq("id", row.id);
    if (error) {
      setFormError(error.message || "Could not remove role.");
      return;
    }
    refresh();
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: "var(--text-heading, #6b1e2e)" }}>Roles</h1>
        <Button label="+ New Role" variant="primary" size="sm" onClick={() => { setFormError(null); setNewName(""); setAddOpen(true); }} />
      </div>
      {formError ? (
        <p role="alert" style={{ margin: "0 0 12px", fontSize: 13, color: "#8b2020" }}>
          {formError}
        </p>
      ) : null}
      <Table columns={columns} rows={roles} emptyState={<span style={{ color: "var(--text-secondary, #6b5e55)" }}>No roles</span>} />

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
          <p role="alert" style={{ margin: 0, fontSize: 13, color: "#8b2020" }}>
            {formError}
          </p>
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
          <p role="alert" style={{ margin: 0, fontSize: 13, color: "#8b2020" }}>
            {formError}
          </p>
        ) : null}
        <Input label="Name" required value={editName} onChange={(e) => setEditName(e.target.value)} size="sm" />
      </Modal>
    </>
  );
}
