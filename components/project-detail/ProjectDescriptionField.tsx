"use client";

import { useCallback, useRef } from "react";
import { Textarea } from "@/components/ui/ds";
import { useToast } from "@/components/Toast";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ProjectDescriptionFieldProps = {
  projectId: string;
  initialValue: string;
  placeholder: string;
  readOnly?: boolean;
};

export function ProjectDescriptionField({
  projectId,
  initialValue,
  placeholder,
  readOnly = false,
}: ProjectDescriptionFieldProps) {
  const { showToast } = useToast();
  const lastSavedRef = useRef<string>(initialValue ?? "");

  const persistDescription = useCallback(
    async (value: string) => {
      if (value === lastSavedRef.current) return;
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("projects")
        .update({ description: value })
        .eq("id", projectId);

      if (error) return;

      lastSavedRef.current = value;
      showToast("Changes saved");
    },
    [projectId, showToast],
  );

  const handleBlur = useCallback(
    async (e: React.FocusEvent<HTMLTextAreaElement>) => {
      await persistDescription(e.currentTarget.value);
    },
    [persistDescription],
  );

  if (readOnly) {
    const text = initialValue?.trim() ?? "";
    if (!text) {
      return (
        <div
          style={{
            backgroundColor: "#f3efe9",
            border: "1px solid #e4ddd3",
            borderRadius: 8,
            height: 68,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <span style={{ fontSize: 14, fontWeight: 500, color: "#998c82" }}>
            No project description added yet.
          </span>
        </div>
      );
    }

    return (
      <div
        style={{
          minHeight: 90,
          padding: "10px 12px",
          borderRadius: 6,
          border: "1px solid var(--border-subtle, #e4ddd3)",
          background: "var(--surface-card-recessed, #f3efe9)",
          fontSize: 13,
          lineHeight: 1.5,
          color: "var(--text-secondary, #6b5e55)",
          fontFamily: "'Plus Jakarta Sans', sans-serif",
          whiteSpace: "pre-wrap",
          wordBreak: "break-word",
          userSelect: "text",
        }}
      >
        {text}
      </div>
    );
  }

  return (
    <div>
      <Textarea
        key={projectId}
        defaultValue={initialValue}
        placeholder={placeholder}
        onBlur={handleBlur}
        size="md"
        variant="form-fixed"
        showLabel={false}
        label=""
        aria-label="Project description"
      />
    </div>
  );
}
