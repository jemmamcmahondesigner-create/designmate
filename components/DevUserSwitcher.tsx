"use client";

import { useEffect, useMemo, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Select } from "@/components/ui/ds";

const STORAGE_KEY = "designtrace_dev_contributor_id";

function isEnabled() {
  return (
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ENABLE_DEV_USER_SWITCHER === "true"
  );
}

type ContributorOption = {
  id: string;
  name: string;
  role: string | null;
};

export function DevUserSwitcher() {
  const enabled = isEnabled();
  const [options, setOptions] = useState<ContributorOption[]>([]);
  const [value, setValue] = useState<string>("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!enabled) return;
    const localValue =
      typeof window !== "undefined" ? window.localStorage.getItem(STORAGE_KEY) : null;
    if (localValue) setValue(localValue);

    const supabase = createSupabaseBrowserClient();
    void supabase
      .from("contributors")
      .select("id, name, role")
      .order("name", { ascending: true })
      .limit(100)
      .then(({ data }) => {
        const next = (data ?? []).map((row) => ({
          id: String((row as Record<string, unknown>).id ?? ""),
          name: String((row as Record<string, unknown>).name ?? ""),
          role:
            (row as Record<string, unknown>).role == null
              ? null
              : String((row as Record<string, unknown>).role),
        }));
        setOptions(next.filter((item) => item.id && item.name));
      });
  }, [enabled]);

  const selectOptions = useMemo(
    () =>
      options.map((option) => ({
        value: option.id,
        label: option.role ? `${option.name} — ${option.role}` : option.name,
      })),
    [options]
  );

  if (!enabled) return null;

  const selectedStillExists = !value || options.some((item) => item.id === value);
  const selectedValue = selectedStillExists ? value : "";

  async function persistSelection(nextValue: string) {
    setSaving(true);
    try {
      if (!nextValue) {
        await fetch("/api/dev/impersonation", { method: "DELETE" });
        window.localStorage.removeItem(STORAGE_KEY);
      } else {
        await fetch("/api/dev/impersonation", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ contributorId: nextValue }),
        });
        window.localStorage.setItem(STORAGE_KEY, nextValue);
      }
      setValue(nextValue);
      window.location.reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={{ paddingTop: 8 }}>
      <div style={{ fontSize: 11, color: "#6b5e55", marginBottom: 6 }}>
        Dev/Test only
      </div>
      <Select
        label="Impersonate contributor"
        size="sm"
        placeholder="Use real auth user"
        options={selectOptions}
        value={selectedValue || undefined}
        onChange={(nextValue) => void persistSelection(nextValue)}
        disabled={saving}
      />
    </div>
  );
}
