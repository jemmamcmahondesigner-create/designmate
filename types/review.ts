export type ReviewType = "compare" | "critique" | "align" | "approve";

export type ReviewDbStatus =
  | "in-review"
  | "approved"
  | "needs-changes"
  | "blocked";

/** Persisted artifact entry (after upload / link capture). */
export type ReviewArtifactStored = {
  kind: "file" | "link";
  title: string;
  iterationLabel: string;
  description: string;
  url: string | null;
  originalFileName?: string | null;
  mimeType?: string | null;
  sizeBytes?: number | null;
};

export type ReviewRow = {
  id: string;
  project_id: string;
  title: string;
  review_type: ReviewType;
  send_notification: boolean;
  review_focus: string | null;
  related_problem_ids: string[];
  reviewer_contributor_ids: string[];
  require_decision_maker: boolean;
  owner_display_name: string;
  artifacts: ReviewArtifactStored[];
  status: ReviewDbStatus;
  created_at: string;
};
