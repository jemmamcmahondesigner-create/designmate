"use client";

import { Divider } from "./Divider";

type TimelineDateDividerProps = {
  label: string;
  /** When true, label on the left with a full-width rule to the right (day groups on project timeline). */
  balanced?: boolean;
};

export function TimelineDateDivider({ label, balanced = false }: TimelineDateDividerProps) {
  if (balanced) {
    return (
      <div
        className="box-border flex w-full min-w-0 max-w-full flex-nowrap items-center gap-2 py-2 pl-[40px] pr-0"
        style={{ color: "var(--text/tertiary, #998c82)" }}
      >
        <span className="shrink-0 whitespace-nowrap text-[11px] font-medium leading-tight">
          {label}
        </span>
        <div className="min-h-0 min-w-0 flex-1 pr-2">
          <Divider className="w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="box-border flex h-[48px] w-full min-w-0 max-w-full flex-nowrap items-center">
      <span
        className="ml-[40px] shrink-0 whitespace-nowrap text-[10px] font-semibold tracking-[1px]"
        style={{ color: "#6b5e55" }}
      >
        {label}
      </span>
      <div className="ml-[10px] min-h-0 min-w-0 flex-1 pr-0">
        <Divider className="w-full" />
      </div>
    </div>
  );
}
