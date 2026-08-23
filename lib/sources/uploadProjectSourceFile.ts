import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ProjectReference } from "@/types/project";

/** Inserted `sources` row shape returned to callers (matches ProjectReference select). */
export type Source = ProjectReference;

const SOURCE_SELECT =
  "id, project_id, label, url, file_name, storage_path, file_type, created_at";

function deriveFileType(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) return "image";
  if (ext === "pdf") return "pdf";
  if (["xlsx", "xls", "csv"].includes(ext)) return "spreadsheet";
  if (["doc", "docx", "txt"].includes(ext)) return "document";
  return "other";
}

function sourceTypeForStoragePath(
  storagePath: string | null | undefined
): "file" | "link" {
  return storagePath != null && String(storagePath).trim() !== ""
    ? "file"
    : "link";
}

async function resolveProjectWorkspaceId(
  supabase: ReturnType<typeof createSupabaseBrowserClient>,
  projectId: string
): Promise<string | null> {
  const { data } = await supabase
    .from("projects")
    .select("workspace_id")
    .eq("id", projectId)
    .maybeSingle();
  const workspaceId = String(
    (data as { workspace_id?: string | null } | null)?.workspace_id ?? ""
  ).trim();
  return workspaceId === "" ? null : workspaceId;
}

/**
 * Upload a file to the project-references bucket and insert a `sources` row.
 * Does not touch UI state, toasts, or timeline events — callers own those.
 */
export async function uploadProjectSourceFile(
  projectId: string,
  file: File
): Promise<Source> {
  const supabase = createSupabaseBrowserClient();

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${projectId}/${crypto.randomUUID()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("project-references")
    .upload(storagePath, file, { upsert: false });

  if (uploadError) {
    console.error("Upload failed:", uploadError.message);
    throw uploadError;
  }

  const { data: urlData } = supabase.storage
    .from("project-references")
    .getPublicUrl(storagePath);

  const publicUrl = urlData.publicUrl;
  const workspaceId = await resolveProjectWorkspaceId(supabase, projectId);

  const { data, error: dbError } = await supabase
    .from("sources")
    .insert({
      project_id: projectId,
      workspace_id: workspaceId,
      source_type: sourceTypeForStoragePath(storagePath),
      label: file.name,
      url: publicUrl,
      file_name: file.name,
      storage_path: storagePath,
      file_type: deriveFileType(file.name),
    })
    .select(SOURCE_SELECT)
    .single();

  if (dbError || !data) {
    throw dbError ?? new Error("Failed to insert source");
  }

  return data as Source;
}
