"use client";

import { useId, useState } from "react";
import { ChevronDown } from "@/lib/phosphor";

const OPTIONS = [
  "Designer",
  "Product Manager",
  "Engineer",
  "Stakeholder",
  "Client",
  "Other"
] as const;

export type RoleSelectProps = {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  "aria-label"?: string;
};

export function RoleSelect({
  value,
  onChange,
  disabled,
  "aria-label": ariaLabel
}: RoleSelectProps) {
  const [focused, setFocused] = useState(false);
  const [hover, setHover] = useState(false);
  const id = useId();

  const borderColor = focused
    ? "#6b1e2e"
    : hover
      ? "#c9c0b4"
      : "#e4ddd3";

  return (
    <div
      className="relative"
      style={{ width: 160 }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className="pointer-events-none relative flex items-center border border-solid bg-white transition-[border-color,box-shadow] duration-150 ease-in-out"
        style={{
          height: 32,
          borderRadius: 6,
          padding: "0 8px",
          gap: 8,
          borderColor,
          boxShadow: focused
            ? "0 0 0 3px rgba(107,30,46,0.12)"
            : "none",
          fontSize: 13,
          fontWeight: 400,
          color: "#2e1c1c"
        }}
        aria-hidden
      >
        <span className="min-w-0 flex-1 truncate">{value}</span>
        <ChevronDown size={12} weight="fill" color="#998c82" aria-hidden />
      </div>
      <select
        id={id}
        value={value}
        disabled={disabled}
        aria-label={ariaLabel}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 z-10 m-0 cursor-pointer opacity-0"
        style={{
          width: "100%",
          height: "100%",
          fontSize: 13,
          fontFamily: "inherit",
          color: "#2e1c1c"
        }}
      >
        {OPTIONS.map((o) => (
          <option
            key={o}
            value={o}
            style={{
              fontSize: 13,
              color: "#2e1c1c",
              padding: "4px 8px"
            }}
          >
            {o}
          </option>
        ))}
      </select>
    </div>
  );
}
