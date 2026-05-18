"use client";

import { useCallback, useRef } from "react";
import { Textarea } from "@/components/ui/ds";
import { useToast } from "@/components/Toast";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

type ProjectDescriptionFieldProps = {
  projectId: string;
  initialValue: string;
  placeholder: string;
};

export function ProjectDescriptionField({
  projectId,
  initialValue,
  placeholder
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
    [projectId, showToast]
  );

  const handleBlur = useCallback(
    async (e: React.FocusEvent<HTMLTextAreaElement>) => {
      await persistDescription(e.currentTarget.value);
    },
    [persistDescription]
  );

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
