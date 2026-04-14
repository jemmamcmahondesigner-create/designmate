"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
  const [savedVisible, setSavedVisible] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearHideTimer = useCallback(() => {
    if (hideTimerRef.current != null) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => clearHideTimer();
  }, [clearHideTimer]);

  const persistDescription = useCallback(
    async (value: string) => {
      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from("projects")
        .update({ description: value })
        .eq("id", projectId);

      if (error) {
        return;
      }

      clearHideTimer();
      setSavedVisible(true);
      hideTimerRef.current = setTimeout(() => {
        setSavedVisible(false);
        hideTimerRef.current = null;
      }, 2000);
    },
    [projectId, clearHideTimer]
  );

  const handleBlur = useCallback(
    async (e: React.FocusEvent<HTMLTextAreaElement>) => {
      setIsFocused(false);
      await persistDescription(e.currentTarget.value);
    },
    [persistDescription]
  );

  const handleFocus = useCallback(() => {
    setIsFocused(true);
  }, []);

  const borderColor = isFocused ? "#6b1e2e" : "#e4ddd3";
  const boxShadow = isFocused
    ? "0 0 0 3px rgba(107,30,46,0.12)"
    : "none";

  return (
    <div>
      <textarea
        key={projectId}
        defaultValue={initialValue}
        placeholder={placeholder}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className="min-h-[100px] w-full resize-y border border-solid bg-white text-[13px] font-normal leading-[1.5] outline-none ring-0 placeholder:text-[#998c82]"
        style={{
          borderColor,
          borderRadius: 6,
          boxShadow,
          color: "#2e1c1c",
          letterSpacing: "0.26px",
          padding: 10,
          transition: "border-color 150ms ease, box-shadow 150ms ease"
        }}
        aria-label="Project description"
      />
      {savedVisible ? (
        <p
          className="mt-1.5 text-[12px] font-normal leading-[1.5]"
          style={{ color: "#998c82", letterSpacing: "0.24px" }}
          role="status"
        >
          Saved
        </p>
      ) : null}
    </div>
  );
}
