"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, IconSquareButton, Input, Menu, MenuItem, Modal, Table, type ColumnDef } from "@/components/ui/ds";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export type ClientRow = {
  id: string;
  name: string;
  industry: string | null;
  website: string | null;
  projectCount: number;
};

export function ClientsSettingsPage({ initialClients }: { initialClients: ClientRow[] }) {
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
      setFormError(error.message || "Could not create client.");
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
      setFormError(error.message || "Could not update client.");
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
      setFormError(error.message || "Could not remove client.");
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
      render: (row) => (
        <span style={{ fontSize: 13, fontWeight: 400, color: "var(--text-secondary, #6b5e55)" }}>
          {row.industry?.trim() ? row.industry : "—"}
        </span>
      ),
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
            label="Client actions"
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
  ];

  return (
    <>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          marginBottom: 16,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            flex: 1,
            minWidth: 0,
            flexWrap: "wrap",
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: 32,
              fontWeight: 800,
              letterSpacing: "-0.96px",
              color: "var(--text-heading, #6b1e2e)",
            }}
          >
            Clients
          </h1>
          <p
            style={{
              margin: 0,
              fontSize: 15,
              fontWeight: 400,
              color: "var(--text-secondary, #6b5e55)",
            }}
          >
            Link projects to clients in order to build insights and a record of decisions on client relationships.
          </p>
        </div>
        <Button
          label="Client"
          variant="primary"
          size="sm"
          icon="leading"
          iconName="plus"
          onClick={openCreate}
        />
      </div>

      {formError && !createOpen && !editClient ? (
        <p role="alert" style={{ margin: "0 0 12px", fontSize: 13, color: "#8b2020" }}>
          {formError}
        </p>
      ) : null}

      <Table
        columns={columns}
        rows={clients}
        emptyState={
          <span style={{ color: "var(--text-secondary, #6b5e55)" }}>No clients yet — add your first client to start linking projects.</span>
        }
      />

      <Modal
        open={createOpen}
        type="form"
        size="sm"
        title="Create Client"
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
        title="Edit Client"
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
        title="Remove client"
        description={
          removeClient
            ? `Are you sure you want to remove ${removeClient.name}? This cannot be undone.`
            : undefined
        }
        confirmLabel="Remove"
        onConfirm={() => void confirmRemove()}
        onClose={() => setRemoveClient(null)}
      />
    </>
  );
}
