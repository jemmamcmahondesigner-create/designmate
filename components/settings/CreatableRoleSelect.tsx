"use client";

import { useCallback, useEffect, useRef } from "react";
import { Select } from "@/components/ui/ds";
import { titleCaseRoleName } from "@/lib/workspace/contributorRoles";

const ROLE_SEARCH_INPUT = 'input[aria-label="Search options"]';
const ROLE_MENU = 'ul[role="listbox"][aria-label="Role"]';

export type CreatableRoleSelectProps = {
  active?: boolean;
  options: { value: string; label: string }[];
  value?: string;
  onChange: (roleName: string) => void;
  size?: "sm" | "md";
  disabled?: boolean;
  placeholder?: string;
};

function cleanRole(value: string): string {
  if (value.startsWith("__role__:")) {
    return decodeURIComponent(value.replace("__role__:", ""));
  }
  return value;
}

export function CreatableRoleSelect({
  active = true,
  options,
  value,
  onChange,
  size = "md",
  disabled = false,
  placeholder = "Select role",
}: CreatableRoleSelectProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const confirmTypedRole = useCallback(
    (raw: string) => {
      const typed = raw.trim();
      if (!typed) return;

      const typedKey = typed.toLowerCase();
      const existing = options.find((option) => {
        const label = option.label.trim().toLowerCase();
        const valueKey = cleanRole(option.value).trim().toLowerCase();
        return (
          label === typedKey ||
          valueKey === typedKey ||
          option.value.trim().toLowerCase() === typedKey
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
      root.querySelector<HTMLInputElement>(ROLE_SEARCH_INPUT);

    const isRoleMenuTarget = (target: Node) => {
      const menu = document.querySelector(ROLE_MENU);
      return menu?.contains(target) ?? false;
    };

    const onPointerDownCapture = (event: PointerEvent) => {
      const target = event.target as Node;
      if (root.contains(target) || isRoleMenuTarget(target)) return;
      const input = getSearchInput();
      if (!input) return;
      confirmTypedRole(input.value);
    };

    const onFocusOutCapture = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      if (next && (root.contains(next) || isRoleMenuTarget(next))) return;
      const input = getSearchInput();
      if (!input) return;
      confirmTypedRole(input.value);
    };

    const onKeyDownCapture = (event: KeyboardEvent) => {
      const input = getSearchInput();
      if (!input || document.activeElement !== input) return;
      if (event.key !== "Enter" && event.key !== "Tab") return;
      if (!input.value.trim()) return;
      if (event.key === "Enter") event.preventDefault();
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
        placeholder={placeholder}
        size={size}
        searchable
        creatable
        creatableOptionLabel={(typed) => `Add '${typed}'`}
        onCreatableSelect={(typed) => {
          const name = titleCaseRoleName(typed);
          if (!name) return undefined;
          return name;
        }}
        portaled
        disabled={disabled}
      />
    </div>
  );
}
