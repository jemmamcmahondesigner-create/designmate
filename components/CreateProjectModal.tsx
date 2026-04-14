"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "@/lib/phosphor";
import { Button, Input } from "@/components/ui/ds";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const CLIENT_OPTIONS = [
  "Internal Project",
  "Gem Designs and Signs",
  "Peak Digital Solutions",
  "Creative Canvas Marketing"
] as const;

export type CreateProjectModalProps = {
  open: boolean;
  onClose: () => void;
};

export function CreateProjectModal({ open, onClose }: CreateProjectModalProps) {
  const router = useRouter();
  const clientId = useId();
  const descId = useId();
  const [name, setName] = useState("");
  const [client, setClient] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const resetForm = useCallback(() => {
    setName("");
    setClient("");
    setDescription("");
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) {
      resetForm();
    }
  }, [open, resetForm]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || submitting) return;

    setSubmitting(true);
    setError(null);

    const supabase = createSupabaseBrowserClient();
    const { error: insertError } = await supabase
      .from("projects")
      .insert({
        name: trimmed,
        client: client.trim() || null,
        description: description.trim() || null,
        status: "active"
      })
      .select("id, description")
      .single();

    setSubmitting(false);

    if (insertError) {
      setError(insertError.message);
      return;
    }

    resetForm();
    onClose();
    router.refresh();
  };

  if (!open) return null;

  const canSubmit = name.trim().length > 0 && !submitting;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <Button
        type="button"
        variant="ghost"
        label=""
        aria-label="Close modal"
        className="absolute inset-0 z-0 h-full w-full !min-h-0 cursor-default !rounded-none !p-0"
        style={{ backgroundColor: "rgba(107,30,46,0.2)" }}
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-project-title"
        className="relative z-10 w-full max-w-[560px] overflow-hidden bg-white"
        style={{
          borderRadius: 16,
          boxShadow:
            "0px 4px 8px rgba(41,33,28,0.08), 0px 16px 32px rgba(41,33,28,0.2)"
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <form onSubmit={handleSubmit}>
          <header
            className="flex items-start justify-between px-6 pt-5"
            style={{ paddingBottom: 16 }}
          >
            <h2
              id="create-project-title"
              className="text-[18px] font-semibold"
              style={{ color: "#6b1e2e" }}
            >
              Create Project
            </h2>
            <Button
              type="button"
              variant="ghost"
              iconOnly
              icon="leading"
              iconName="x"
              label="Close"
              aria-label="Close"
              className="!h-8 !w-8 !min-w-[32px] !p-0"
              onClick={onClose}
            />
          </header>
          <div
            className="h-px w-full"
            style={{ backgroundColor: "#ede8e0" }}
          />

          <div
            className="flex flex-col gap-6"
            style={{ padding: "20px 24px" }}
          >
            <Input
              type="text"
              label="Project name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="i.e. Website Redesign"
              autoComplete="off"
              size="sm"
              helperText="Give your project a clear, descriptive name"
            />

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={clientId}
                className="text-[13px] font-medium"
                style={{ color: "#2e1c1c" }}
              >
                Who is the project for?
              </label>
              <div className="relative">
                <select
                  id={clientId}
                  value={client}
                  onChange={(e) => setClient(e.target.value)}
                  className="w-full cursor-pointer appearance-none border bg-white px-3 pr-9 text-[14px] outline-none focus:border-[#6b1e2e]"
                  style={{
                    height: 32,
                    borderColor: "#e4ddd3",
                    borderRadius: 6,
                    color: client ? "#2e1c1c" : "#998c82"
                  }}
                >
                  <option value="">Select a client</option>
                  {CLIENT_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
                <span
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[#6b5e55]"
                  aria-hidden
                >
                  <ChevronDown size={14} weight="fill" color="#6b5e55" />
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label
                htmlFor={descId}
                className="text-[13px] font-medium"
                style={{ color: "#2e1c1c" }}
              >
                Project Description
              </label>
              <textarea
                id={descId}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A brief overview of the project goals..."
                rows={4}
                className="min-h-[91px] w-full resize-y border p-2.5 text-[14px] outline-none focus:border-[#6b1e2e]"
                style={{
                  borderColor: "#e4ddd3",
                  borderRadius: 6
                }}
              />
            </div>

            {error ? (
              <p className="text-[13px] text-red-600" role="alert">
                {error}
              </p>
            ) : null}
          </div>

          <footer
            className="flex items-center justify-between gap-4"
            style={{ padding: "16px 24px 20px" }}
          >
            <span className="text-[13px] font-normal" style={{ color: "#6b5e55" }}>
              Required*
            </span>
            <div className="flex items-center gap-3">
              <Button
                type="button"
                variant="secondary"
                label="Cancel"
                onClick={onClose}
              />
              <Button
                type="submit"
                variant="accent"
                label={submitting ? "Creating…" : "Create Project"}
                disabled={!canSubmit}
              />
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
