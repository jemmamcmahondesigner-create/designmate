"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { Button, Input, Select } from "@/components/ui/ds";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type RoleOpt = { id: string; name: string };

type ContributorProfile = {
  id: string;
  name: string;
  email: string | null;
  roleId: string | null;
  roleName: string | null;
};

function profileInitials(name: string) {
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

export function ProfileSettingsPage({
  contributor,
}: {
  contributor: ContributorProfile | null;
}) {
  const [name, setName] = useState(contributor?.name ?? "");
  const [email, setEmail] = useState(contributor?.email ?? "");
  const [roleId, setRoleId] = useState(contributor?.roleId ?? "");
  const [roleOptions, setRoleOptions] = useState<RoleOpt[]>([]);
  const roleOptionsRef = useRef<RoleOpt[]>([]);
  const { showToast } = useToast();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!contributor) return;
    setName(contributor.name);
    setEmail(contributor.email ?? "");
    setRoleId(contributor.roleId ?? "");
  }, [contributor]);

  useEffect(() => {
    const load = async () => {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.from("contributor_roles").select("id, name").order("name", { ascending: true });
      const mapped =
        data?.map((row) => {
          const o = row as Record<string, unknown>;
          return { id: String(o.id ?? ""), name: String(o.name ?? "") };
        }).filter((r) => r.id && r.name) ?? [];
      roleOptionsRef.current = mapped;
      setRoleOptions(mapped);
    };
    void load();
  }, []);

  const roleSelectOptions = useMemo(
    () => roleOptions.map((r) => ({ value: r.id, label: r.name })),
    [roleOptions]
  );

  const save = async () => {
    if (!contributor || !name.trim()) return;
    setSaving(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const roleName = roleOptionsRef.current.find((r) => r.id === roleId)?.name ?? null;
    const { error: uErr } = await supabase
      .from("contributors")
      .update({
        name: name.trim(),
        email: email.trim() || null,
        role: roleName,
        role_id: roleId || null,
      })
      .eq("id", contributor.id);
    setSaving(false);
    if (uErr) {
      setError(uErr.message || "Could not save profile.");
      return;
    }
    showToast("Changes saved");
  };

  if (!contributor) {
    return (
      <p style={{ margin: 0, fontSize: 15, color: "var(--text-secondary, #6b5e55)" }}>
        No profile loaded. Use the dev user switcher in the sidebar to impersonate a contributor.
      </p>
    );
  }

  return (
    <>
      <h1 style={{ margin: "0 0 16px", fontSize: 32, fontWeight: 800, color: "var(--text-heading, #6b1e2e)" }}>
        Your Profile
      </h1>
      {error ? (
        <p role="alert" style={{ color: "#8b2020", fontSize: 13 }}>
          {error}
        </p>
      ) : null}
      <div
        style={{
          width: 100,
          height: 100,
          borderRadius: "50%",
          background: "var(--brand-primary-subtle, #f5eaec)",
          color: "var(--text-heading, #6b1e2e)",
          fontSize: 28,
          fontWeight: 600,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 20,
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}
        aria-hidden
      >
        {profileInitials(name)}
      </div>
      {/* TODO: avatar upload */}
      <div style={{ display: "flex", flexDirection: "column", gap: 12, maxWidth: 400 }}>
        <Input label="Display Name" required value={name} onChange={(e) => setName(e.target.value)} size="sm" />
        <Input label="Email" value={email} onChange={(e) => setEmail(e.target.value)} size="sm" />
        <Select
          label="Role"
          options={roleSelectOptions}
          value={roleId || undefined}
          onChange={(v) => setRoleId(v)}
          placeholder="Select role"
          size="sm"
        />
        <Button label="Save" variant="primary" size="sm" disabled={saving || !name.trim()} onClick={() => void save()} />
      </div>
    </>
  );
}
