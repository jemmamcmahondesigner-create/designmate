export type ReviewType = "compare" | "critique" | "align" | "approve";

export type ReviewDbStatus =
  | "draft"
  | "in-review"
  | "feedback-submitted"
  | "paused"
  | "complete"
  | "approved"
  | "needs-changes"
  | "changes-needed"
  | "blocked";

/** Row shape for project review list cards (Supabase → UI). */
export type ReviewCardData = {
  id?: string;
  title: string;
  status: ReviewDbStatus;
  /** `reviews.decision_status` for Complete pill colour on cards. */
  decisionStatus?: string | null;
  /** `reviews.require_decision_maker` */
  requireDecisionMaker?: boolean;
  ownerName: string;
  /** Relative / formatted date string for display */
  dateLabel: string;
  /** Short focus text from DB, shown as card description when set */
  description?: string | null;
  review_focus?: string | null;
  iterationLabel?: string;
  commentCount?: number;
  decisionCount?: number;
  tags?: Array<{
    label: string;
    variant?:
      | "default"
      | "aqua"
      | "brand"
      | "mint"
      | "butter"
      | "warning"
      | "success"
      | "error"
      | "neutral";
  }>;
  artifact_file_name?: string | null;
  artifact_file_type?: "figma" | "pdf" | null;
  artifact_name?: string | null;
  artifact_iteration?: string | null;
  artifact_description?: string | null;
  artifact_file_url?: string | null;
};

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
  artifact_file_name?: string | null;
  artifact_file_type?: "figma" | "pdf" | null;
  artifact_name?: string | null;
  artifact_iteration?: string | null;
  artifact_description?: string | null;
  artifact_file_url?: string | null;
  status: ReviewDbStatus;
  created_at: string;
};
