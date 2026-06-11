"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, IconSquareButton, Input, Menu, MenuItem, Modal, Table, type ColumnDef } from "@/components/ui/ds";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import settingsTableLayoutStyles from "./settingsTableLayout.module.css";
import groupsTableStyles from "./ClientsSettingsPage.module.css";

export type ClientRow = {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  projectCount: number;
};

export function ClientsSettingsPage({
  initialClients,
  readOnly = false,
}: {
  initialClients: ClientRow[];
  readOnly?: boolean;
}) {
  const router = useRouter();
  const [clients, setClients] = useState(initialClients);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState({ name: "", industry: "", website: "" });

  const [editClient, setEditClient] = useState<ClientRow | null>(null);
  const [editForm, setEditForm] = useState({ name: "", industry: "", website: "" });

  const [removeClient, setRemoveClient] = useState<ClientRow | null>(null);

  const actionRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    setClients(initialClients);
  }, [initialClients]);

  const refresh = () => router.refresh();

  const openCreate = () => {
    setFormError(null);
    setCreateForm({ name: "", industry: "", website: "" });
    setCreateOpen(true);
  };

  const saveCreate = async () => {
    const name = createForm.name.trim();
    if (!name) return;
    setFormError(null);
    const supabase = createSupabaseBrowserClient();
    const industry = createForm.industry.trim() || null;
    const website = createForm.website.trim() || null;
    const { error } = await supabase.from("clients").insert({ name, industry, website });
    if (error) {
      setFormError(error.message || "Could not create group.");
      return;
    }
    setCreateOpen(false);
    refresh();
  };

  const openEdit = (row: ClientRow) => {
    setFormError(null);
    setEditClient(row);
    setEditForm({
      name: row.name,
      industry: row.industry ?? "",
      website: row.website ?? "",
    });
    setOpenMenuId(null);
  };

  const saveEdit = async () => {
    if (!editClient) return;
    const name = editForm.name.trim();
    if (!name) return;
    setFormError(null);
    const supabase = createSupabaseBrowserClient();
    const industry = editForm.industry.trim() || null;
    const website = editForm.website.trim() || null;
    const { error } = await supabase
      .from("clients")
      .update({ name, industry, website })
      .eq("id", editClient.id);
    if (error) {
      setFormError(error.message || "Could not update group.");
      return;
    }
    setEditClient(null);
    refresh();
  };

  const confirmRemove = async () => {
    if (!removeClient) return;
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.from("clients").delete().eq("id", removeClient.id);
    if (error) {
      setFormError(error.message || "Could not remove group.");
      setRemoveClient(null);
      return;
    }
    setRemoveClient(null);
    refresh();
  };

  const columns: ColumnDef<ClientRow>[] = [
    {
      key: "name",
      label: "Name",
      width: "flex",
      cellType: "custom",
      render: (row) => (
        <span style={{ fontSize: 13, fontWeight: 600, color: "var(--text-primary, #2e1c1c)" }}>{row.name}</span>
      ),
    },
    {
      key: "industry",
      label: "Industry",
      width: 200,
      cellType: "custom",
      render: (row) => {
        const industry = row.industry?.trim();
        return (
          <span
            style={{
              fontSize: 13,
              fontWeight: 400,
              color: industry
                ? "var(--text-secondary, #6b5e55)"
                : "var(--text-disabled, #c9c0b4)",
            }}
          >
            {industry || "—"}
          </span>
        );
      },
    },
    {
      key: "website",
      label: "Website",
      width: 200,
      cellType: "custom",
      render: (row) => {
        const website = row.website?.trim();
        return (
          <span
            style={{
              fontSize: 13,
              fontWeight: 400,
              color: website
                ? "var(--text-secondary, #6b5e55)"
                : "var(--text-disabled, #c9c0b4)",
            }}
          >
            {website || "—"}
          </span>
        );
      },
    },
    {
      key: "projects",
      label: "Projects",
      width: 120,
      cellType: "custom",
      render: (row) => (
        <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text-secondary, #6b5e55)" }}>{row.projectCount}</span>
      ),
    },
    ...(readOnly
      ? []
      : [
          {
            key: "actions",
            label: "",
            width: 40,
            cellType: "kebab" as const,
            render: (row: ClientRow) => (
              <>
                <IconSquareButton
                  ref={(el) => {
                    actionRefs.current[row.id] = el;
                  }}
                  variant="ghost"
                  icon="kebab"
                  label="Group actions"
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
                      openEdit(row);
                    }}
                  />
                  <MenuItem
                    label="Remove"
                    destructive
                    onClick={() => {
                      setOpenMenuId(null);
                      setRemoveClient(row);
                    }}
                  />
                </Menu>
              </>
            ),
          },
        ]),
  ];

  return (
    <div className={settingsTableLayoutStyles.pageContent}>
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          gap: 16,
          flexWrap: "wrap",
          marginBottom: 16,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <h1
            style={{
              margin: 0,
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: "-0.96px",
              color: "var(--text-heading, #6b1e2e)",
            }}
          >
            Groups
          </h1>
          <p
            style={{
              margin: "8px 0 0",
              fontSize: 15,
              fontWeight: 400,
              color: "var(--text-secondary, #6b5e55)",
            }}
          >
            Link projects to groups to organise your work and track decisions across teams and client relationships.
          </p>
        </div>
        {!readOnly ? (
          <div style={{ flexShrink: 0 }}>
            <Button
              label="New Group"
              variant="primary"
              size="sm"
              icon="leading"
              iconName="plus"
              onClick={openCreate}
            />
          </div>
        ) : null}
      </div>

      {formError && !createOpen && !editClient ? (
        <p role="alert" style={{ margin: "0 0 12px", fontSize: 13, color: "#8b2020" }}>
          {formError}
        </p>
      ) : null}

      <div
        className={settingsTableLayoutStyles.tableShell}
        style={{ minWidth: 0, width: "100%" }}
      >
        <div className={settingsTableLayoutStyles.tableScroll}>
          <div className={settingsTableLayoutStyles.tableScrollInner}>
            <Table
              className={`${settingsTableLayoutStyles.tableBorderless} ${groupsTableStyles.groupsTable}`}
              columns={columns}
              rows={clients}
              emptyState={
                <span style={{ color: "var(--text-secondary, #6b5e55)" }}>No groups yet — add your first group to start linking projects.</span>
              }
            />
          </div>
        </div>
      </div>

      <Modal
        open={createOpen}
        type="form"
        size="sm"
        title="Create Group"
        onClose={() => setCreateOpen(false)}
        footer={
          <div style={{ display: "flex", width: "100%", justifyContent: "flex-end", gap: 8 }}>
            <Button label="Cancel" variant="secondary" size="sm" onClick={() => setCreateOpen(false)} />
            <Button
              label="Save"
              variant="primary"
              size="sm"
              disabled={!createForm.name.trim()}
              onClick={() => void saveCreate()}
            />
          </div>
        }
      >
        {formError ? (
          <p role="alert" style={{ margin: "0 0 12px", fontSize: 13, color: "#8b2020" }}>
            {formError}
          </p>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input label="Name" required value={createForm.name} onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))} size="sm" />
          <Input label="Industry" value={createForm.industry} onChange={(e) => setCreateForm((f) => ({ ...f, industry: e.target.value }))} size="sm" />
          <Input
            label="Website"
            type="url"
            value={createForm.website}
            onChange={(e) => setCreateForm((f) => ({ ...f, website: e.target.value }))}
            size="sm"
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(editClient)}
        type="form"
        size="sm"
        title="Edit Group"
        onClose={() => setEditClient(null)}
        footer={
          <div style={{ display: "flex", width: "100%", justifyContent: "flex-end", gap: 8 }}>
            <Button label="Cancel" variant="secondary" size="sm" onClick={() => setEditClient(null)} />
            <Button
              label="Save"
              variant="primary"
              size="sm"
              disabled={!editForm.name.trim()}
              onClick={() => void saveEdit()}
            />
          </div>
        }
      >
        {formError ? (
          <p role="alert" style={{ margin: "0 0 12px", fontSize: 13, color: "#8b2020" }}>
            {formError}
          </p>
        ) : null}
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <Input label="Name" required value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} size="sm" />
          <Input label="Industry" value={editForm.industry} onChange={(e) => setEditForm((f) => ({ ...f, industry: e.target.value }))} size="sm" />
          <Input
            label="Website"
            type="url"
            value={editForm.website}
            onChange={(e) => setEditForm((f) => ({ ...f, website: e.target.value }))}
            size="sm"
          />
        </div>
      </Modal>

      <Modal
        open={Boolean(removeClient)}
        type="destructive"
        title="Remove group"
        description={
          removeClient
            ? `Are you sure you want to remove ${removeClient.name}? This cannot be undone.`
            : undefined
        }
        confirmLabel="Remove"
        onConfirm={() => void confirmRemove()}
        onClose={() => setRemoveClient(null)}
      />
    </div>
  );
}
