import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ReviewArtifactStored, ReviewType } from "@/types/review";

export type ArtifactDraftForSubmit = {
  kind: "file" | "link";
  file: File | null;
  linkUrl: string;
  title: string;
  iterationLabel: string;
  description: string;
};

export type SubmitReviewInput = {
  reviewId: string;
  projectId: string;
  title: string;
  reviewType: ReviewType;
  sendNotification: boolean;
  reviewFocus: string | null;
  relatedProblemIds: string[];
  reviewerContributorIds: string[];
  requireDecisionMaker: boolean;
  ownerDisplayName: string;
  artifacts: ArtifactDraftForSubmit[];
};

function isValidHttpUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function sanitizePathSegment(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 200) || "file";
}

export function validateSubmitInput(
  input: SubmitReviewInput
): string | null {
  if (!input.title.trim()) return "Review title is required.";
  if (!input.projectId) return "Project is required.";
  if (input.reviewerContributorIds.length === 0)
    return "Add at least one reviewer.";
  if (input.artifacts.length === 0) return "Add at least one artifact.";
  for (const a of input.artifacts) {
    if (!a.title.trim()) return "Each artifact needs a title.";
    if (a.kind === "file") {
      if (!a.file) return "Each file artifact needs an uploaded file.";
    } else {
      if (!isValidHttpUrl(a.linkUrl)) return "Enter a valid http(s) link for each link artifact.";
    }
  }
  return null;
}

export async function submitReviewClient(
  input: SubmitReviewInput
): Promise<{ error: string | null }> {
  const clientError = validateSubmitInput(input);
  if (clientError) return { error: clientError };

  const supabase = createSupabaseBrowserClient();
  const stored: ReviewArtifactStored[] = [];

  for (let i = 0; i < input.artifacts.length; i++) {
    const a = input.artifacts[i];
    if (a.kind === "file" && a.file) {
      const safeName = sanitizePathSegment(a.file.name);
      const objectPath = `${input.reviewId}/${i}-${crypto.randomUUID()}-${safeName}`;
      const { error: upErr } = await supabase.storage
        .from("review-artifacts")
        .upload(objectPath, a.file, {
          cacheControl: "3600",
          upsert: false
        });

      let publicUrl: string | null = null;
      if (!upErr) {
        const { data: pub } = supabase.storage
          .from("review-artifacts")
          .getPublicUrl(objectPath);
        publicUrl = pub.publicUrl ?? null;
      }

      stored.push({
        kind: "file",
        title: a.title.trim(),
        iterationLabel: a.iterationLabel.trim(),
        description: a.description.trim(),
        url: publicUrl,
        originalFileName: a.file.name,
        mimeType: a.file.type || null,
        sizeBytes: a.file.size
      });
    } else {
      stored.push({
        kind: "link",
        title: a.title.trim(),
        iterationLabel: a.iterationLabel.trim(),
        description: a.description.trim(),
        url: a.linkUrl.trim()
      });
    }
  }

  const { error } = await supabase.from("reviews").insert({
    id: input.reviewId,
    project_id: input.projectId,
    title: input.title.trim(),
    review_type: input.reviewType,
    send_notification: input.sendNotification,
    review_focus: input.reviewFocus?.trim() || null,
    related_problem_ids: input.relatedProblemIds,
    reviewer_contributor_ids: input.reviewerContributorIds,
    require_decision_maker: input.requireDecisionMaker,
    owner_display_name: input.ownerDisplayName.trim() || "Reviewer",
    artifacts: stored,
    status: "in-review"
  });

  if (error) {
    return { error: error.message };
  }
  return { error: null };
}
