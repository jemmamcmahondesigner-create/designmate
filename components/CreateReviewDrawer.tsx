"use client";

import { createPortal } from "react-dom";
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useRouter } from "next/navigation";
import { AddLinkModal } from "@/components/AddLinkModal";
import { UploadModal } from "@/components/UploadModal";
import type { ArtifactModalSavePayload } from "@/components/artifact-modals/artifactModalShared";
import {
  fetchProjectArtifactsForRelatedSelect,
  isFigmaUrl,
  isValidHttpUrl,
} from "@/components/artifact-modals/artifactModalShared";
import { DiscardChangesModal } from "@/components/DiscardChangesModal";
import { ArtifactCountIndicator } from "@/components/artifacts/ArtifactCountIndicator";
import modalStyles from "@/components/ui/ds/Modal.module.css";
import { useToast } from "@/components/Toast";
import {
  Alert,
  Avatar,
  ArtifactPreview,
  Button,
  Checkbox,
  Drawer,
  Icon,
  Input,
  Modal,
  Menu,
  MenuItem,
  MenuSectionHeading,
  Select,
  SelectField,
  Tag,
  Textarea,
  TextareaAi,
  Tooltip,
  TradeoffCard,
} from "@/components/ui/ds";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  formatVersionLabel,
  isValidVersionString,
} from "@/lib/artifacts/versioning";
import { getActiveWorkspaceId } from "@/lib/workspace/activeWorkspace";
import { sendWorkspaceInvite } from "@/lib/workspace/invite-client";
import { inviteToastMessage } from "@/lib/workspace/invite-toast";
import {
  isPaidPermissionLevel,
  toStoredPermissionLevel,
  type ContentPermissionLevel,
} from "@/lib/workspace/permissions";
import { logTimelineEventClient } from "@/lib/timeline/logEventClient";
import { uploadProjectSourceFile } from "@/lib/sources/uploadProjectSourceFile";
import type { Source } from "@/lib/sources/uploadProjectSourceFile";
import { linkContributorToProject } from "@/lib/contributors/linkContributorToProject";
import {
  flatReviewerPickerList,
  splitReviewerPickerSections,
} from "@/lib/reviews/reviewerPickerSections";
import type {
  ArtifactDraftForSubmit,
  SubmitReviewInput
} from "@/lib/reviews/submitReviewClient";
import { generateReviewTitle } from "@/app/actions/generateReviewTitle";
import { generateReviewFocus } from "@/app/actions/generateReviewFocus";
import {
  generateTradeoffs,
  type Tradeoff,
} from "@/app/actions/generateTradeoffs";
import type { ArtifactDescriptionState } from "@/components/ui/ds";
import type { ArtifactPreviewFileType } from "@/components/ui/ds/ArtifactPreview";
import type { ProjectProblem } from "@/types/project";
import type { ReviewType } from "@/types/review";
import type { User } from "@/types/user";
import { getAvatarInlineStyle, avatarColourKey } from "@/lib/utils/avatarColour";

export type { ReviewType } from "@/types/review";

const SURFACE = "#ffffff";
const TOKENS = {
  heading: "var(--text/heading, #6b1e2e)",
  primary: "var(--text/primary, #2e1c1c)",
  secondary: "var(--text/secondary, #6b5e55)",
  tertiary: "var(--text/tertiary, #998c82)",
  disabled: "var(--text/disabled, #c9c0b4)",
  inverse: "var(--text/inverse, #ffffff)",
  borderSubtle: "var(--border/subtle, #ede8e0)",
  borderDefault: "var(--border/default, #e4ddd3)",
  brand: "var(--brand/primary, #6b1e2e)",
  neutral200: "var(--neutral/200, #e4ddd3)",
  radiusInput: "var(--radius/component/input, 6px)",
  radiusButtonSm: "var(--radius/component/button-sm, 6px)",
  error: "#8b2020"
} as const;

export type CreateReviewDrawerProps = {
  open: boolean;
  onClose: () => void;
  teammateOptions: User[];
  projectProblems: ProjectProblem[];
  projectScoped: boolean;
  projectMenuOptions: { id: string; name: string }[];
  selectedRelatedProjectId: string;
  onSelectedRelatedProjectIdChange: (projectId: string) => void;
  reviewerPoolKey: string;
  effectiveProjectId: string;
  onCreateReview: (input: SubmitReviewInput) => Promise<{ error: string | null }>;
  /** Called after a review is created successfully (before drawer closes) */
  onReviewCreated?: () => void;
  /** Emitted when the form has edits that would be lost on close. */
  onDirtyChange?: (dirty: boolean) => void;
};

const REVIEW_TYPE_OPTIONS: { value: ReviewType; label: string }[] = [
  { value: "align", label: "Align" },
  { value: "compare", label: "Compare" },
  { value: "critique", label: "Critique" },
  { value: "approve", label: "Approve" }
];

const REVIEW_TYPE_HELPER_TEXT: Record<ReviewType, string> = {
  align:
    "Share early direction for high-level input. Reviewers indicate if the work is heading in the right direction.",
  compare:
    "Present multiple options for stakeholders to choose between. The first reviewer selected is the final decision maker.",
  critique:
    "Request detailed feedback on specific aspects of the work. Reviewers summarise their comments from Figma or other tools.",
  approve:
    "Reviewers sign off on individual artifacts or request changes before work progresses.",
};

/** v1…vN for in-card version selector (Create Review step 1). */
const VERSION_LABEL_OPTIONS = Array.from(
  { length: 30 },
  (_, i) => `v${i + 1}`
);

const TEAMMATE_ROLE_SELECT_OPTIONS = [
  { value: "Designer", label: "Designer" },
  { value: "Product Manager", label: "Product Manager" },
  { value: "Engineer", label: "Engineer" },
  { value: "Stakeholder", label: "Stakeholder" }
] as const;

const TEAMMATE_PERMISSION_SELECT_OPTIONS = [
  { value: "reviewer", label: "Reviewer" },
  { value: "editor", label: "Editor" },
] as const;

function DrawerArtifactToastPortal({ message }: { message: string }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  if (!mounted || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed z-[301]"
      style={{
        bottom: 24,
        left: 24,
        backgroundColor: "#ebf6ee",
        border: "1px solid #7dc98f",
        borderRadius: 8,
        padding: "12px 16px",
        fontSize: 13,
        fontWeight: 500,
        color: "#256b38",
        boxShadow: "0px 4px 12px rgba(41,33,28,0.12)",
        maxWidth: 360
      }}
      role="status"
    >
      {message}
    </div>,
    document.body
  );
}

type ArtifactDraft = {
  localKey: string;
  kind: "file" | "link";
  file: File | null;
  linkUrl: string;
  title: string;
  /** `v{n}` display; keep aligned with `versionNumber`. */
  iterationLabel: string;
  description: string;
  versionNumber: string;
  /** When adding from an existing canonical artifact; null = new artifact on submit. */
  resolvedArtifactId: string | null;
  /** User-entered name at save — written to `artifact_versions.label`. */
  versionRowLabel: string;
  descriptionAiState?: ArtifactDescriptionState;
  /** Session-only — tracks whether the current description came from AI (for submit payload if needed later). */
  aiGenerated?: boolean;
};

function modalPayloadToArtifactDraft(
  payload: ArtifactModalSavePayload,
  existingTitles: Set<string>,
): ArtifactDraft {
  const baseTitle = payload.title.trim();
  let finalTitle = baseTitle;
  let counter = 2;
  while (existingTitles.has(finalTitle)) {
    finalTitle = `${baseTitle} ${counter}`;
    counter++;
  }
  const versionLabel = formatVersionLabel(payload.versionNumber);
  return {
    localKey: payload.localKey,
    kind: payload.kind,
    file: payload.kind === "file" ? payload.file : null,
    linkUrl: payload.kind === "link" ? payload.linkUrl.trim() : "",
    title: finalTitle,
    versionRowLabel: payload.versionRowLabel.trim() || finalTitle,
    iterationLabel: versionLabel,
    description: payload.description.trim(),
    versionNumber: versionLabel,
    resolvedArtifactId: payload.canonicalArtifactId,
    descriptionAiState: "idle",
    aiGenerated: false,
  };
}

function artifactTypeLabelForApi(
  a: Pick<ArtifactDraft, "kind" | "linkUrl" | "file">
): string {
  if (a.kind === "link") {
    const url = a.linkUrl.toLowerCase();
    if (url.includes("figma.com")) return "Figma";
    return "Link";
  }
  if (a.file) {
    const ext = a.file.name.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "pdf") return "PDF";
    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) {
      return "Image";
    }
    return "File";
  }
  return "File";
}

/** First sentence of `desc`, trimmed, max `maxLen` chars; empty if no usable text. */
function firstSentenceForTitle(desc: string, maxLen: number): string {
  const t = desc.trim();
  if (!t) return "";
  let end = -1;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (
      (c === "." || c === "!" || c === "?") &&
      (i === t.length - 1 || /\s/.test(t[i + 1] ?? ""))
    ) {
      end = i + 1;
      break;
    }
  }
  let s = end >= 0 ? t.slice(0, end).trim() : t;
  if (s.length > maxLen) s = s.slice(0, maxLen).trim();
  return s;
}

function getFileType(artifact: ArtifactDraft): ArtifactPreviewFileType {
  if (artifact.kind === "link") {
    const url = artifact.linkUrl.toLowerCase();
    if (url.includes("figma.com")) return "figma";
    return "link";
  }
  if (artifact.kind === "file" && artifact.file) {
    const ext = artifact.file.name.split(".").pop()?.toLowerCase() ?? "";
    if (ext === "pdf") return "pdf";
    if (["jpg", "jpeg", "png", "gif", "webp", "svg"].includes(ext)) {
      return ext as ArtifactPreviewFileType;
    }
    return "generic";
  }
  return "generic";
}

function StakeholderChip({
  user,
  onRemove
}: {
  user: User;
  onRemove: () => void;
}) {
  return (
    <div
      className="inline-flex max-w-full items-center gap-2 border border-solid"
      style={{
        height: 32,
        paddingLeft: 6,
        paddingRight: 6,
        borderRadius: TOKENS.radiusButtonSm,
        borderColor: TOKENS.borderSubtle,
        backgroundColor: SURFACE
      }}
    >
      <Avatar
        src={user.avatarUrl ?? undefined}
        name={user.name}
        contributorId={user.id}
        size="md"
      />
      <span
        className="min-w-0 truncate"
        style={{
          fontSize: 13,
          fontWeight: 500,
          lineHeight: 1.5,
          letterSpacing: "0.26px",
          color: TOKENS.primary
        }}
      >
        {user.name}
      </span>
      <Tooltip label={`Remove ${user.name}`} position="top">
        <button
          type="button"
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded border-0 bg-transparent p-0 outline-none"
          style={{ color: TOKENS.tertiary }}
          aria-label={`Remove ${user.name}`}
          onClick={onRemove}
        >
          <Icon name="close" size={14} />
        </button>
      </Tooltip>
    </div>
  );
}

function step2SubmitEnabled(reviewType: ReviewType, reviewers: User[]) {
  if (reviewers.length === 0) return false;
  if (reviewType === "compare" || reviewType === "approve") {
    return true;
  }
  return reviewers.length >= 1;
}

function requireDecisionMakerForDb(reviewType: ReviewType): boolean {
  return reviewType === "compare" || reviewType === "approve";
}

export function CreateReviewDrawer({
  open,
  onClose,
  teammateOptions,
  projectProblems,
  projectScoped,
  projectMenuOptions,
  selectedRelatedProjectId,
  onSelectedRelatedProjectIdChange,
  reviewerPoolKey,
  effectiveProjectId,
  onCreateReview,
  onReviewCreated,
  onDirtyChange
}: CreateReviewDrawerProps) {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const drawerBodyRef = useRef<HTMLDivElement>(null);
  const reviewerBlockRef = useRef<HTMLDivElement>(null);
  const problemsSelectRef = useRef<HTMLDivElement>(null);
  const sourcesSelectRef = useRef<HTMLDivElement>(null);
  const sourceFileInputRef = useRef<HTMLInputElement>(null);

  const [showDraftWarningModal, setShowDraftWarningModal] = useState(false);
  const [addLinkModalOpen, setAddLinkModalOpen] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [tradeoffModalOpen, setTradeoffModalOpen] = useState(false);
  const [newTradeoffText, setNewTradeoffText] = useState("");
  const [newTradeoffSeverity, setNewTradeoffSeverity] = useState<
    "High" | "Medium" | "Low"
  >("Medium");
  const [newTradeoffArtifactLabel, setNewTradeoffArtifactLabel] = useState("");
  const [projectArtifactCount, setProjectArtifactCount] = useState(0);

  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewType, setReviewType] = useState<ReviewType>("approve");
  const [artifacts, setArtifacts] = useState<ArtifactDraft[]>([]);
  const [artifactPreviews, setArtifactPreviews] = useState<Record<string, string>>({});
  const [figmaMetaMap, setFigmaMetaMap] = useState<
    Record<string, { fileName: string; lastEdited: string } | null>
  >({});
  const [reviewers, setReviewers] = useState<User[]>([]);
  const [availableTeammates, setAvailableTeammates] = useState<User[]>(
    teammateOptions
  );
  const [availableProblems, setAvailableProblems] = useState<ProjectProblem[]>(
    projectProblems
  );
  const [sendNotification, setSendNotification] = useState(true);
  const [relatedProblems, setRelatedProblems] = useState<string[]>([]);
  const [availableSources, setAvailableSources] = useState<Source[]>([]);
  const [relatedSources, setRelatedSources] = useState<string[]>([]);
  const [hoveredSourceRowId, setHoveredSourceRowId] = useState<string | null>(
    null
  );
  const [hoveredProblemRowId, setHoveredProblemRowId] = useState<string | null>(
    null
  );
  const [reviewFocus, setReviewFocus] = useState("");
  const [step1SubmitAttempted, setStep1SubmitAttempted] = useState(false);
  const [step2SubmitAttempted, setStep2SubmitAttempted] = useState(false);

  const [reviewerQuery, setReviewerQuery] = useState("");
  const [reviewerMenuOpen, setReviewerMenuOpen] = useState(false);
  const [problemsMenuOpen, setProblemsMenuOpen] = useState(false);
  const [problemsSelectOpen, setProblemsSelectOpen] = useState(false);
  const [sourcesSelectOpen, setSourcesSelectOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  /** Blocks Create until Step 3 has settled (avoids Next→Create click carry-over when focus already filled). */
  const createArmedRef = useRef(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [artifactToast, setArtifactToast] = useState<string | null>(null);
  const [hoveredChipId, setHoveredChipId] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [createTeammateModalOpen, setCreateTeammateModalOpen] = useState(false);
  const [newTeammateName, setNewTeammateName] = useState("");
  const [newTeammateEmail, setNewTeammateEmail] = useState("");
  const [newTeammateRole, setNewTeammateRole] = useState("");
  const [newTeammatePermissionLevel, setNewTeammatePermissionLevel] =
    useState<ContentPermissionLevel>("reviewer");
  const [includeTeammateInProject, setIncludeTeammateInProject] = useState(true);
  const [isCreatingTeammate, setIsCreatingTeammate] = useState(false);
  const [teammateEmailExistsError, setTeammateEmailExistsError] = useState<
    string | null
  >(null);

  const [createProblemModalOpen, setCreateProblemModalOpen] = useState(false);
  const [newProblemDescription, setNewProblemDescription] = useState("");
  const [includeNewProblemInProject, setIncludeNewProblemInProject] =
    useState(true);
  const [isCreatingProblem, setIsCreatingProblem] = useState(false);
  const [reviewSpecificProblemIds, setReviewSpecificProblemIds] = useState<string[]>([]);

  const router = useRouter();
  const { showToast } = useToast();

  // ── AI assist (Populate-with-AI flow) ────────────────────────────────────
  const titleIsAiGenerated = useRef(false);
  /**
   * Tracks whether the current `reviewType` value still reflects an AI
   * suggestion (true) or has been manually overridden by the user (false).
   * Starts `true` so the very first AI title-generation call is allowed to
   * also pre-fill the review type. Flipped to `false` the moment the user
   * picks a value in the Review type Select.
   */
  const reviewTypeIsAiSuggested = useRef(true);
  const reviewTitleRef = useRef("");
  const reviewFocusRef = useRef("");
  const reviewTypeRef = useRef<ReviewType>("approve");
  const artifactsLatestRef = useRef<ArtifactDraft[]>([]);
  const figmaMetaMapRef = useRef<
    Record<string, { fileName: string; lastEdited: string } | null>
  >({});
  const [reviewTitleGenerating, setReviewTitleGenerating] = useState(false);
  const [reviewFocusGenerating, setReviewFocusGenerating] = useState(false);
  const [reviewFocusGeneratingAction, setReviewFocusGeneratingAction] = useState<
    "regenerate" | "optimise" | null
  >(null);
  const [reviewFocusAiGenerated, setReviewFocusAiGenerated] = useState(false);
  const [reviewFocusStale, setReviewFocusStale] = useState(false);
  const [reviewFocusHasGenerated, setReviewFocusHasGenerated] = useState(false);
  const reviewFocusSnapshotRef = useRef<string | null>(null);
  const [tradeoffsGenerating, setTradeoffsGenerating] = useState(false);
  const [aiTradeoffs, setAiTradeoffs] = useState<Tradeoff[]>([]);
  const [isBodyOverflowing, setIsBodyOverflowing] = useState(false);

  const uid = useId();
  const titleFieldId = `${uid}-title`;
  const reviewersFieldId = `${uid}-reviewers`;
  const reviewersListboxId = `${uid}-reviewers-listbox`;
  const notifyFieldId = `${uid}-notify`;
  const problemsFieldId = `${uid}-problems`;
  const problemsLabelId = `${uid}-problems-label`;
  const sourcesFieldId = `${uid}-sources`;
  const focusFieldId = `${uid}-focus`;
  const createTeammateNameFieldId = `${uid}-create-teammate-name`;
  const createTeammateEmailFieldId = `${uid}-create-teammate-email`;
  const includeTeammateCheckboxId = `${uid}-include-teammate-in-project`;
  const createProblemTextareaId = `${uid}-create-problem-text`;
  const includeNewProblemCheckboxId = `${uid}-include-new-problem-in-project`;

  // Keep a ref to the latest artifactPreviews so `reset` can revoke the blob
  // URLs without having artifactPreviews in its dependency array. A stable
  // `reset` identity prevents the [open, reset] cleanup effect from
  // re-subscribing on every preview change.
  const artifactPreviewsRef = useRef(artifactPreviews);
  useEffect(() => {
    artifactPreviewsRef.current = artifactPreviews;
  }, [artifactPreviews]);

  // Keep refs in sync so async AI callbacks read the freshest values
  // (closures captured at call time may be stale by the time the API resolves).
  useEffect(() => {
    reviewTitleRef.current = reviewTitle;
  }, [reviewTitle]);
  useEffect(() => {
    reviewFocusRef.current = reviewFocus;
  }, [reviewFocus]);
  useEffect(() => {
    reviewTypeRef.current = reviewType;
  }, [reviewType]);
  useEffect(() => {
    artifactsLatestRef.current = artifacts;
  }, [artifacts]);
  useEffect(() => {
    if (reviewType !== "compare" || artifacts.length >= 2) return;
    reviewTypeIsAiSuggested.current = false;
    setReviewType("approve");
    setArtifactToast(
      "Compare requires at least 2 artifacts. Review type changed to Approve.",
    );
    const timer = window.setTimeout(() => setArtifactToast(null), 4000);
    return () => window.clearTimeout(timer);
  }, [artifacts.length, reviewType]);
  useEffect(() => {
    figmaMetaMapRef.current = figmaMetaMap;
  }, [figmaMetaMap]);

  function addArtifactFromModal(payload: ArtifactModalSavePayload) {
    if (artifacts.length >= 10) return;
    const existingTitles = new Set(artifacts.map((a) => a.title.trim()));
    const newArtifact = modalPayloadToArtifactDraft(payload, existingTitles);
    const localKey = newArtifact.localKey;

    setArtifacts((prev) => [...prev, newArtifact]);

    if (newArtifact.kind === "file" && newArtifact.file) {
      const file = newArtifact.file;
      if (
        [
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
          "image/svg+xml",
          "application/pdf",
        ].includes(file.type)
      ) {
        const url = URL.createObjectURL(file);
        setArtifactPreviews((prev) => ({ ...prev, [localKey]: url }));
      }
    }

    if (newArtifact.kind === "link" && isFigmaUrl(newArtifact.linkUrl)) {
      const oEmbedUrl = `https://www.figma.com/api/oembed?url=${encodeURIComponent(newArtifact.linkUrl.trim())}`;
      void fetch(oEmbedUrl)
        .then((r) => r.json())
        .then((data: { title?: string }) => {
          const raw = data?.title?.trim();
          if (!raw) return;
          setFigmaMetaMap((prev) => ({
            ...prev,
            [localKey]: {
              fileName: raw,
              lastEdited: "Just added",
            },
          }));
        })
        .catch(() => undefined);
    }

    setTimeout(() => {
      const names = artifactsLatestRef.current
        .map((x) => {
          const fromDesc = firstSentenceForTitle(x.description, 120);
          if (fromDesc) return fromDesc;
          return x.title.trim();
        })
        .filter(Boolean);
      if (names.length > 0) void runReviewTitleGeneration(names);
    }, 0);
    setArtifactToast("Artifact added");
    setTimeout(() => setArtifactToast(null), 3000);
    setTimeout(() => {
      drawerBodyRef.current?.scrollTo({
        top: drawerBodyRef.current.scrollHeight,
        behavior: "smooth",
      });
    }, 50);
  }

  const reset = useCallback(() => {
    Object.values(artifactPreviewsRef.current).forEach((url) =>
      URL.revokeObjectURL(url)
    );
    setArtifactPreviews({});
    setFigmaMetaMap({});
    setCurrentStep(1);
    setReviewTitle("");
    setReviewType("approve");
    setArtifacts([]);
    setReviewers([]);
    setSendNotification(true);
    setShowDraftWarningModal(false);
    setRelatedProblems([]);
    setRelatedSources([]);
    setAvailableSources([]);
    setHoveredSourceRowId(null);
    setHoveredProblemRowId(null);
    setReviewSpecificProblemIds([]);
    setReviewFocus("");
    setReviewerQuery("");
    setReviewerMenuOpen(false);
    setProblemsMenuOpen(false);
    setProblemsSelectOpen(false);
    setSourcesSelectOpen(false);
    setSubmitting(false);
    createArmedRef.current = false;
    setToastMessage(null);
    setHoveredChipId(null);
    setAddLinkModalOpen(false);
    setUploadModalOpen(false);
    setTradeoffModalOpen(false);
    setNewTradeoffText("");
    setNewTradeoffSeverity("Medium");
    setNewTradeoffArtifactLabel("");
    setProjectArtifactCount(0);
    setStep1SubmitAttempted(false);
    setStep2SubmitAttempted(false);
    titleIsAiGenerated.current = false;
    reviewTypeIsAiSuggested.current = true;
    reviewTitleRef.current = "";
    reviewTypeRef.current = "approve";
    artifactsLatestRef.current = [];
    figmaMetaMapRef.current = {};
    setReviewTitleGenerating(false);
    setReviewFocusGenerating(false);
    setReviewFocusGeneratingAction(null);
    setReviewFocusAiGenerated(false);
    setReviewFocusStale(false);
    setReviewFocusHasGenerated(false);
    reviewFocusSnapshotRef.current = null;
    setTradeoffsGenerating(false);
    setAiTradeoffs([]);
    setCreateTeammateModalOpen(false);
    setNewTeammateName("");
    setNewTeammateEmail("");
    setNewTeammateRole("");
    setNewTeammatePermissionLevel("reviewer");
    setIncludeTeammateInProject(true);
    setIsCreatingTeammate(false);
    setTeammateEmailExistsError(null);
    setCreateProblemModalOpen(false);
    setNewProblemDescription("");
    setIncludeNewProblemInProject(true);
    setIsCreatingProblem(false);
  }, []);

  const closeCreateTeammateModal = useCallback(() => {
    setCreateTeammateModalOpen(false);
    setNewTeammateName("");
    setNewTeammateEmail("");
    setNewTeammateRole("");
    setNewTeammatePermissionLevel("reviewer");
    setTeammateEmailExistsError(null);
    setIncludeTeammateInProject(true);
    setIsCreatingTeammate(false);
  }, []);

  const closeCreateProblemModal = useCallback(() => {
    setCreateProblemModalOpen(false);
    setNewProblemDescription("");
    setIncludeNewProblemInProject(true);
    setIsCreatingProblem(false);
  }, []);

  useEffect(() => {
    if (!createTeammateModalOpen) return;
    setIncludeTeammateInProject(Boolean(effectiveProjectId.trim()));
    // Only set the default when the modal opens — not when projectId changes while open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createTeammateModalOpen]);

  useEffect(() => {
    if (!createProblemModalOpen) return;
    setIncludeNewProblemInProject(Boolean(effectiveProjectId.trim()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createProblemModalOpen]);

  useEffect(() => {
    if (!createTeammateModalOpen) return;
    const email = newTeammateEmail.trim().toLowerCase();
    if (!email) {
      setTeammateEmailExistsError(null);
      return;
    }
    let cancelled = false;
    const handle = window.setTimeout(() => {
      const supabase = createSupabaseBrowserClient();
      void (async () => {
        const activeWorkspaceId = await getActiveWorkspaceId(supabase);
        let query = supabase.from("contributors").select("id").ilike("email", email).limit(1);
        if (activeWorkspaceId) {
          query = query.eq("workspace_id", activeWorkspaceId);
        }
        const { data } = await query;
        if (cancelled) return;
        setTeammateEmailExistsError(
          Array.isArray(data) && data.length > 0
            ? "A teammate with this email already exists."
            : null
        );
      })();
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [createTeammateModalOpen, newTeammateEmail]);

  useEffect(() => {
    if (!open) {
      reset();
      setDiscardOpen(false);
    }
  }, [open, reset]);

  useEffect(() => {
    if (currentStep !== 3) {
      createArmedRef.current = false;
      return;
    }
    createArmedRef.current = false;
    const timer = window.setTimeout(() => {
      createArmedRef.current = true;
    }, 400);
    return () => {
      window.clearTimeout(timer);
      createArmedRef.current = false;
    };
  }, [currentStep]);

  // Detect body overflow to conditionally show footer drop-shadow
  useEffect(() => {
    const el = drawerBodyRef.current;
    if (!el) return;
    const check = () => setIsBodyOverflowing(el.scrollHeight > el.clientHeight);
    check();
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => ro.disconnect();
  }, [open]);

  const dirty =
    currentStep !== 1 ||
    reviewTitle.trim() !== "" ||
    artifacts.length > 0 ||
    reviewers.length > 0 ||
    relatedProblems.length > 0 ||
    relatedSources.length > 0 ||
    reviewFocus.trim() !== "" ||
    (!projectScoped && selectedRelatedProjectId.trim() !== "") ||
    !sendNotification;

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);

  function requestClose() {
    if (dirty) setDiscardOpen(true);
    else onClose();
  }

  function handleSendNotificationChange(checked: boolean) {
    if (!checked && sendNotification) {
      setShowDraftWarningModal(true);
      return;
    }
    setSendNotification(checked);
  }

  useEffect(() => {
    if (!addLinkModalOpen && !uploadModalOpen && !createTeammateModalOpen && !createProblemModalOpen)
      return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (createProblemModalOpen) {
        closeCreateProblemModal();
        return;
      }
      if (createTeammateModalOpen) {
        closeCreateTeammateModal();
        return;
      }
      setAddLinkModalOpen(false);
      setUploadModalOpen(false);
      setProblemsSelectOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [
    addLinkModalOpen,
    uploadModalOpen,
    createTeammateModalOpen,
    createProblemModalOpen,
    closeCreateTeammateModal,
    closeCreateProblemModal
  ]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setProblemsSelectOpen(false);
        setSourcesSelectOpen(false);
      }
    }
    if (problemsSelectOpen || sourcesSelectOpen) {
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
  }, [problemsSelectOpen, sourcesSelectOpen]);

  useEffect(() => {
    setRelatedProblems([]);
    setRelatedSources([]);
  }, [reviewerPoolKey]);

  useEffect(() => {
    setAvailableTeammates(teammateOptions);
  }, [teammateOptions]);

  useEffect(() => {
    setAvailableProblems(projectProblems);
  }, [projectProblems]);

  useEffect(() => {
    if (!open || currentStep !== 2) return;
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    const q = reviewerQuery.trim().toLowerCase();
    const projectContributorIds = new Set(
      teammateOptions
        .map((teammate) => String(teammate.id ?? "").trim())
        .filter(Boolean)
    );
    void (async () => {
      const activeWorkspaceId = await getActiveWorkspaceId(supabase);
      if (!activeWorkspaceId) {
        if (!cancelled) setAvailableTeammates([]);
        return;
      }

      const response = await fetch(
        `/api/workspace/contributor-picker-options?${new URLSearchParams({
          workspaceId: activeWorkspaceId,
        }).toString()}`,
      );
      if (cancelled) return;
      if (!response.ok) {
        setAvailableTeammates([]);
        return;
      }

      const payload = (await response.json()) as {
        options?: Array<{
          id: string;
          name: string;
          email: string | null;
          userId: string;
          isPending?: boolean;
        }>;
      };

      const mapped = (payload.options ?? [])
        .map(
          (option) =>
            ({
              id: option.id,
              name: option.name,
              email: option.email,
              userId: option.userId?.trim() ? option.userId : null,
              isPending: option.isPending ?? !option.userId?.trim(),
              avatarUrl: null,
            }) satisfies User,
        )
        .filter((person) => {
          if (!q) return true;
          return (
            person.name.toLowerCase().includes(q) ||
            (person.email ?? "").toLowerCase().includes(q)
          );
        });

      mapped.sort((a, b) => {
        const aProject = projectContributorIds.has(a.id) ? 0 : 1;
        const bProject = projectContributorIds.has(b.id) ? 0 : 1;
        if (aProject !== bProject) return aProject - bProject;
        return a.name.localeCompare(b.name);
      });
      setAvailableTeammates(mapped);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, currentStep, effectiveProjectId, reviewerQuery, teammateOptions]);

  useEffect(() => {
    if (!open || currentStep !== 3) return;
    if (!effectiveProjectId) return;
    const projectId = effectiveProjectId.trim();
    if (!projectId) return;
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    void (async () => {
      const [{ data: problemData }, { data: sourceData }] = await Promise.all([
        supabase
          .from("problems")
          .select("id, description")
          .eq("project_id", projectId)
          .is("review_id", null)
          .order("created_at", { ascending: true }),
        supabase
          .from("sources")
          .select(
            "id, project_id, label, url, file_name, storage_path, file_type, created_at"
          )
          .eq("project_id", projectId)
          .order("created_at", { ascending: true }),
      ]);
      if (cancelled) return;
      if (!Array.isArray(problemData)) {
        setAvailableProblems([]);
      } else {
        setAvailableProblems(
          problemData.map((row) => {
            const item = row as Record<string, unknown>;
            return {
              id: String(item.id ?? ""),
              description: String(item.description ?? ""),
            } satisfies ProjectProblem;
          })
        );
      }
      if (!Array.isArray(sourceData)) {
        setAvailableSources([]);
      } else {
        setAvailableSources(
          sourceData.map((row) => {
            const item = row as Record<string, unknown>;
            const url = item.url;
            const fileName = item.file_name;
            const storagePath = item.storage_path;
            const fileType = item.file_type;
            const createdAt = item.created_at;
            return {
              id: String(item.id ?? ""),
              project_id: String(item.project_id ?? ""),
              label: String(item.label ?? ""),
              url: url == null || String(url).trim() === "" ? null : String(url),
              file_name:
                fileName == null || String(fileName).trim() === ""
                  ? null
                  : String(fileName),
              storage_path:
                storagePath == null || String(storagePath).trim() === ""
                  ? null
                  : String(storagePath),
              file_type:
                fileType == null || String(fileType).trim() === ""
                  ? null
                  : String(fileType),
              created_at:
                createdAt == null || String(createdAt).trim() === ""
                  ? new Date(0).toISOString()
                  : String(createdAt),
            } satisfies Source;
          })
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, currentStep, effectiveProjectId]);

  useEffect(() => {
    if (!open || !effectiveProjectId?.trim()) {
      setProjectArtifactCount(0);
      return;
    }
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    const pid = effectiveProjectId.trim();
    void fetchProjectArtifactsForRelatedSelect(supabase, pid).then((rows) => {
      if (!cancelled) setProjectArtifactCount(rows.length);
    });
    return () => {
      cancelled = true;
    };
  }, [open, effectiveProjectId]);

  useLayoutEffect(() => {
    if (!open) return;
    const id = window.requestAnimationFrame(() => {
      titleInputRef.current?.focus();
    });
    return () => window.cancelAnimationFrame(id);
  }, [open]);

  

  const relatedProjectOk =
    projectScoped || selectedRelatedProjectId.trim().length > 0;

  const artifactsValid =
    artifacts.length > 0 &&
    artifacts.length <= 10 &&
    artifacts.every((a) => {
      if (!a.title.trim()) return false;
      if (!a.iterationLabel.trim() || !isValidVersionString(a.versionNumber)) return false;
      if (a.kind === "file") return Boolean(a.file);
      return isValidHttpUrl(a.linkUrl);
    });

  const step1NextActive = artifactsValid;

  const step2NextActive =
    step2SubmitEnabled(reviewType, reviewers) &&
    (projectScoped || Boolean(selectedRelatedProjectId.trim())) &&
    Boolean(reviewTitle.trim());

  const step3CreateActive = reviewFocus.trim().length > 0;

  const hasFocusGenerationContext =
    artifacts.length > 0 || aiTradeoffs.length > 0 || Boolean(reviewType);
  const focusButtonDisabled =
    reviewFocusGenerating ||
    (reviewFocus.trim().length === 0 && !hasFocusGenerationContext);
  const focusButtonTooltip =
    reviewFocus.trim().length === 0 && !hasFocusGenerationContext
      ? "Add artifacts, tradeoffs, or a review type to generate a review focus."
      : undefined;
  const focusButtonOptimiseTooltip =
    reviewFocus.trim().length > 0 &&
    !reviewFocusGenerating &&
    !(reviewFocusAiGenerated && reviewFocus.trim().length > 0)
      ? "Fixes grammar and spelling. Your content and meaning are preserved."
      : undefined;
  const focusAiButtonTooltip = focusButtonTooltip ?? focusButtonOptimiseTooltip;

  const artifactDescriptionsKey = JSON.stringify(
    artifacts.map((artifact) => artifact.description.trim()).filter((d) => d.length > 0),
  );
  const problemsKey = JSON.stringify(relatedProblems);
  const tradeoffsKey = JSON.stringify(
    aiTradeoffs.map((tradeoff) => tradeoff.description.trim()).filter((d) => d.length > 0),
  );
  const selectedProjectKey = effectiveProjectId.trim();

  const buildReviewFocusSnapshot = useCallback(() => {
    return JSON.stringify({
      reviewTitle: reviewTitle.trim(),
      reviewType,
      selectedProject: selectedProjectKey,
      artifactDescriptionsKey,
      problemsKey,
      tradeoffsKey,
    });
  }, [
    reviewTitle,
    reviewType,
    selectedProjectKey,
    artifactDescriptionsKey,
    problemsKey,
    tradeoffsKey,
  ]);

  useEffect(() => {
    if (!reviewFocusHasGenerated || reviewFocusGenerating) return;
    const snapshot = buildReviewFocusSnapshot();
    if (reviewFocusSnapshotRef.current === null) {
      reviewFocusSnapshotRef.current = snapshot;
      return;
    }
    if (snapshot !== reviewFocusSnapshotRef.current) {
      setReviewFocusStale(true);
    }
  }, [
    buildReviewFocusSnapshot,
    reviewFocusHasGenerated,
    reviewFocusGenerating,
  ]);

  const showFocusGenerateButton =
    !reviewFocusGenerating && reviewFocus.trim().length === 0;
  const showFocusRegenerateButton =
    reviewFocus.trim().length > 0 &&
    reviewFocusStale &&
    reviewFocusHasGenerated;
  const showFocusOptimiseButton = reviewFocus.trim().length > 0;

  const step1TooltipLabel = useMemo(() => {
    if (artifacts.length === 0) return "Add at least one artifact to continue";
    if (!artifactsValid) {
      return "Complete each artifact name, version, and file or valid link";
    }
    return "Complete required fields to proceed";
  }, [artifacts.length, artifactsValid]);

  const step2TooltipLabel = useMemo(() => {
    if (!projectScoped && !selectedRelatedProjectId.trim()) return "Select a project to continue";
    if (!reviewTitle.trim()) return "Enter a review title to continue";
    if (reviewers.length === 0) return "Add at least one reviewer to continue";
    return "Complete required fields to proceed";
  }, [projectScoped, selectedRelatedProjectId, reviewTitle, reviewers.length]);

  const step3TooltipLabel = useMemo(() => {
    if (!reviewFocus.trim()) return "Add a review focus to continue";
    return "Complete required fields to proceed";
  }, [reviewFocus]);

  const titleFieldError = step2SubmitAttempted && !reviewTitle.trim();
  const relatedProjectFieldError =
    !projectScoped && step2SubmitAttempted && !selectedRelatedProjectId.trim();
  const reviewersFieldError = step2SubmitAttempted && reviewers.length === 0;

  const filteredTeammates = availableTeammates.filter((u) => {
    const q = reviewerQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      (u.email?.toLowerCase().includes(q) ?? false)
    );
  });

  const filteredProjectTeammates = useMemo(() => {
    const q = reviewerQuery.trim().toLowerCase();
    return teammateOptions.filter((u) => {
      if (!q) return true;
      return (
        u.name.toLowerCase().includes(q) ||
        (u.email?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [teammateOptions, reviewerQuery]);

  const reviewerPickerSections = useMemo(() => {
    if (!effectiveProjectId.trim()) return null;
    return splitReviewerPickerSections(filteredProjectTeammates, filteredTeammates);
  }, [effectiveProjectId, filteredProjectTeammates, filteredTeammates]);

  const reviewerMenuPeople = useMemo(() => {
    if (!effectiveProjectId.trim()) return filteredTeammates;
    if (!reviewerPickerSections) return filteredTeammates;
    return flatReviewerPickerList(reviewerPickerSections);
  }, [effectiveProjectId, filteredTeammates, reviewerPickerSections]);

  const reviewerExclude = new Set(reviewers.map((r) => r.id));

  const selectedProjectName =
    projectMenuOptions.find((p) => p.id === selectedRelatedProjectId)?.name ?? "";

  // Title AI still uses a two-bucket surface; focus AI gets the real ReviewType.
  function reviewTypeForTitleAi(rt: ReviewType): "Approval" | "Comparison" {
    return rt === "compare" ? "Comparison" : "Approval";
  }

  /** Auto-generate review title from artifact names (Step 1 → Step 2 wiring). */
  async function runReviewTitleGeneration(names: string[]) {
    if (names.length === 0) return;
    const currentTitle = reviewTitleRef.current.trim();
    // Don't overwrite user-typed content unless it was previously AI-generated.
    if (currentTitle !== "" && !titleIsAiGenerated.current) return;
    if (reviewTitleGenerating) return;
    const latestArtifacts = artifactsLatestRef.current;
    const artifactContext = latestArtifacts.map((a) => ({
      versionNumber: a.versionNumber,
      hasRelatedArtifact: a.resolvedArtifactId != null,
    }));
    const priorReviewsExist = projectArtifactCount > 0;
    setReviewTitleGenerating(true);
    const result = await generateReviewTitle({
      artifactNames: names,
      reviewType: reviewTypeForTitleAi(reviewTypeRef.current),
      artifactContext,
      priorReviewsExist,
    });
    setReviewTitleGenerating(false);
    if (!result.ok) return;
    // Re-check the guard after the await; the user may have typed in the meantime.
    const latest = reviewTitleRef.current.trim();
    if (latest === "" || titleIsAiGenerated.current) {
      titleIsAiGenerated.current = true;
      setReviewTitle(result.title);
    }
    // Apply the suggested review type only if the user hasn't manually picked one.
    if (reviewTypeIsAiSuggested.current) {
      // Keep the flag true so subsequent AI title-gen runs can still update the type.
      setReviewType(result.suggestedReviewType);
    }
  }

  /** Generate or optimise review focus (wand / labelled AI button on Step 3). */
  async function runReviewFocusGeneration(
    currentArtifacts: ArtifactDraft[],
    action: "regenerate" | "optimise" = "regenerate",
  ) {
    const existing = reviewFocusRef.current.trim();
    const artifactContext = currentArtifacts.map((artifact) => ({
      name: artifact.title.trim() || "Untitled",
      description: artifact.description.trim(),
    }));
    const descriptions = artifactContext
      .map((artifact) => artifact.description)
      .filter(Boolean);
    if (
      !existing &&
      descriptions.length === 0 &&
      aiTradeoffs.length === 0 &&
      !reviewTypeRef.current
    ) {
      return;
    }
    if (action === "optimise" && !existing) {
      return;
    }
    const selectedProblems = relatedProblems
      .map((id) => availableProblems.find((p) => p.id === id)?.description ?? "")
      .map((d) => d.trim())
      .filter(Boolean);
    const selectedTradeoffs = aiTradeoffs
      .map((t) => t.description.trim())
      .filter(Boolean);
    const selectedSources = relatedSources
      .map((id) => availableSources.find((source) => source.id === id))
      .filter((source): source is NonNullable<typeof source> => Boolean(source))
      .map((source) => {
        const label =
          source.label?.trim() || source.file_name?.trim() || "Untitled";
        const sourceType =
          source.storage_path != null &&
          String(source.storage_path).trim() !== ""
            ? "file"
            : "link";
        const url =
          sourceType === "link" && source.url?.trim()
            ? source.url.trim()
            : undefined;
        return url
          ? { label, sourceType, url }
          : { label, sourceType };
      });
    setReviewFocusGenerating(true);
    setReviewFocusGeneratingAction(action);
    const result = await generateReviewFocus({
      artifactDescriptions: descriptions,
      artifactContext,
      reviewType: reviewTypeRef.current,
      projectName: selectedProjectName.trim() || undefined,
      reviewTitle: reviewTitleRef.current.trim() || undefined,
      selectedProblems: selectedProblems.length > 0 ? selectedProblems : undefined,
      selectedTradeoffs: selectedTradeoffs.length > 0 ? selectedTradeoffs : undefined,
      selectedSources: selectedSources.length > 0 ? selectedSources : undefined,
      existingContent: action === "optimise" ? existing || undefined : undefined,
    });
    setReviewFocusGenerating(false);
    setReviewFocusGeneratingAction(null);
    if (!result.ok) return;
    setReviewFocus(result.focus);
    reviewFocusSnapshotRef.current = buildReviewFocusSnapshot();
    setReviewFocusStale(false);
    setReviewFocusAiGenerated(true);
    setReviewFocusHasGenerated(true);
  }

  /** Auto-generate tradeoffs when comparing exactly 2 artifacts (Step 3 mount via Populate-with-AI). */
  async function runTradeoffsGeneration(currentArtifacts: ArtifactDraft[]) {
    if (currentArtifacts.length !== 2) return;
    const [a, b] = currentArtifacts;
    if (!a.description.trim() || !b.description.trim()) return;
    setTradeoffsGenerating(true);
    const result = await generateTradeoffs({
      artifactDescriptions: [a.description, b.description],
      artifactLabels: [
        a.title.trim() || a.iterationLabel || "Artifact A",
        b.title.trim() || b.iterationLabel || "Artifact B",
      ],
    });
    setTradeoffsGenerating(false);
    if (!result.ok) return;
    setAiTradeoffs(result.tradeoffs);
  }

  function closeTradeoffModal() {
    setTradeoffModalOpen(false);
    setNewTradeoffText("");
    setNewTradeoffSeverity("Medium");
    setNewTradeoffArtifactLabel("");
  }

  function handleConfirmAddTradeoff() {
    const description = newTradeoffText.trim();
    if (!description) return;
    setAiTradeoffs((prev) => [
      ...prev,
      {
        description,
        severity: newTradeoffSeverity,
        artifactLabel: newTradeoffArtifactLabel.trim(),
      },
    ]);
    closeTradeoffModal();
  }

  function removeArtifactByKey(localKey: string) {
    setArtifacts((prev) => prev.filter((x) => x.localKey !== localKey));
    setArtifactPreviews((prev) => {
      const url = prev[localKey];
      if (url) URL.revokeObjectURL(url);
      const next = { ...prev };
      delete next[localKey];
      return next;
    });
    setFigmaMetaMap((prev) => {
      const next = { ...prev };
      delete next[localKey];
      return next;
    });
  }

  async function handleCreateReview() {
    if (currentStep !== 3 || !createArmedRef.current || !step3CreateActive || submitting) {
      return;
    }
    setToastMessage(null);
    const projectId = effectiveProjectId.trim();
    if (!projectId) {
      setToastMessage("Select a project.");
      return;
    }

    const artifactPayload: ArtifactDraftForSubmit[] = artifacts.map((a) => ({
      kind: a.kind,
      file: a.file,
      linkUrl: a.linkUrl,
      title: a.title,
      iterationLabel: a.iterationLabel,
      description: a.description,
      resolvedCanonicalArtifactId: a.resolvedArtifactId,
      versionNumber: a.versionNumber,
      versionRowLabel: a.versionRowLabel.trim() || a.title.trim(),
    }));

    const reviewSpecificProblemIdSet = new Set(reviewSpecificProblemIds);
    const reviewSpecificProblems = availableProblems
      .filter(
        (problem) =>
          reviewSpecificProblemIdSet.has(problem.id) &&
          relatedProblems.includes(problem.id),
      )
      .map((problem) => ({
        id: problem.id,
        description: problem.description,
      }));

    const input: SubmitReviewInput = {
      reviewId: crypto.randomUUID(),
      projectId,
      title: reviewTitle.trim(),
      reviewType,
      sendNotification: sendNotification,
      reviewFocus: reviewFocus.trim() || null,
      relatedProblemIds: relatedProblems,
      relatedSourceIds: relatedSources,
      reviewSpecificProblems,
      reviewerContributorIds: reviewers.map((r) => r.id),
      requireDecisionMaker: requireDecisionMakerForDb(reviewType),
      ownerDisplayName: reviewers[0]?.name ?? "Reviewer",
      artifacts: artifactPayload,
      tradeoffs: aiTradeoffs.length > 0 ? aiTradeoffs : undefined,
    };

    setSubmitting(true);
    const { error } = await onCreateReview(input);
    setSubmitting(false);
    if (error) {
      setToastMessage(error);
      return;
    }
    onReviewCreated?.();
    onClose();
  }

  const artifactModalProjectId = effectiveProjectId.trim() || null;

  return (
    <>
    <Drawer
      open={open}
      type="create"
      width={480}
      onClose={requestClose}
      scrimClosable={!dirty}
      onEscapeWhenScrimBlocked={() => setDiscardOpen(true)}
      bodyRef={drawerBodyRef}
      title="Create a new design review"
      subtitle={`Step ${currentStep} of 3`}
      footerStyle={{
        boxShadow: isBodyOverflowing
          ? "0px -2px 8px rgba(41, 33, 28, 0.08)"
          : "none",
        background: "var(--surface-card-default, #ffffff)"
      }}
      footer={
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            width: "100%"
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div
              className="min-w-0 shrink-0"
              style={{
                width: 72,
                visibility: "visible"
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  fontWeight: 400,
                  lineHeight: 1.5,
                  letterSpacing: "0.26px",
                  color: TOKENS.secondary
                }}
              >
                Required*
              </span>
            </div>
            <div className="flex flex-1 justify-end" style={{ gap: 8 }}>
              {currentStep === 1 ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    label="Cancel"
                    size="sm"
                    onClick={requestClose}
                  />
                  <div
                    onPointerDownCapture={() => {
                      if (!step1NextActive) setStep1SubmitAttempted(true);
                    }}
                    style={{ display: "inline-flex" }}
                  >
                    {step1NextActive ? (
                      <Button
                        key="create-review-step-1-next"
                        type="button"
                        variant="primary"
                        label="Next"
                        icon="trailing"
                        iconName="chevron-right"
                        size="md"
                        onClick={() => {
                          setStep1SubmitAttempted(false);
                          setCurrentStep(2);
                        }}
                      />
                    ) : (
                      <Tooltip label={step1TooltipLabel} position="top">
                        <span style={{ display: "inline-flex" }}>
                          <Button
                            key="create-review-step-1-next-disabled"
                            type="button"
                            variant="primary"
                            label="Next"
                            icon="trailing"
                            iconName="chevron-right"
                            size="md"
                            disabled
                            aria-disabled
                          />
                        </span>
                      </Tooltip>
                    )}
                  </div>
                </>
              ) : currentStep === 2 ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    label="Back"
                    icon="leading"
                    iconName="chevron-left"
                    size="sm"
                    onClick={() => setCurrentStep(1)}
                  />
                  <div
                    onPointerDownCapture={() => {
                      if (!step2NextActive) setStep2SubmitAttempted(true);
                    }}
                    style={{ display: "inline-flex" }}
                  >
                    {step2NextActive ? (
                      <Button
                        key="create-review-step-2-next"
                        type="button"
                        variant="primary"
                        label="Next"
                        icon="trailing"
                        iconName="chevron-right"
                        size="md"
                        onClick={() => {
                          setStep2SubmitAttempted(false);
                          setCurrentStep(3);
                        }}
                      />
                    ) : (
                      <Tooltip label={step2TooltipLabel} position="top">
                        <span style={{ display: "inline-flex" }}>
                          <Button
                            key="create-review-step-2-next-disabled"
                            type="button"
                            variant="primary"
                            label="Next"
                            icon="trailing"
                            iconName="chevron-right"
                            size="md"
                            disabled
                            aria-disabled
                          />
                        </span>
                      </Tooltip>
                    )}
                  </div>
                </>
              ) : (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    label="Back"
                    icon="leading"
                    iconName="chevron-left"
                    size="md"
                    disabled={submitting}
                    onClick={() => {
                      setStep2SubmitAttempted(false);
                      setCurrentStep(2);
                    }}
                  />
                  <div style={{ display: "inline-flex" }}>
                    {step3CreateActive && !submitting ? (
                      <Button
                        key="create-review-step-3-create"
                        type="button"
                        variant="accent"
                        label="Create Review"
                        icon="trailing"
                        iconName="chevron-right"
                        size="md"
                        onClick={() => void handleCreateReview()}
                      />
                    ) : (
                      <Tooltip
                        label={submitting ? "Please wait…" : step3TooltipLabel}
                        position="top"
                      >
                        <span style={{ display: "inline-flex" }}>
                          <Button
                            key="create-review-step-3-create-disabled"
                            type="button"
                            variant="accent"
                            label={submitting ? "Saving…" : "Create Review"}
                            icon="trailing"
                            iconName="chevron-right"
                            size="md"
                            disabled
                            aria-disabled
                          />
                        </span>
                      </Tooltip>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      }
    >
      <div
        className="form-content-zone flex min-w-0 w-full flex-col"
        style={{
          gap: 24,
          backgroundColor: SURFACE
        }}
      >
          {toastMessage ? (
            <Alert
              sentiment="danger"
              prominence="low"
              title="Something went wrong"
              body={toastMessage}
              dismissible
              onDismiss={() => setToastMessage(null)}
            />
          ) : null}
          {currentStep === 1 ? (
            <>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                  }}
                >
                  <p
                    style={{
                      fontSize: 13,
                      fontWeight: 500,
                      lineHeight: 1.5,
                      letterSpacing: "0.26px",
                      color: "#2e1c1c",
                      margin: 0,
                    }}
                  >
                    Artifacts*
                  </p>
                  <ArtifactCountIndicator count={artifacts.length} />
                </div>
                <div
                  className="flex flex-wrap"
                  style={{ gap: 8 }}
                  role="group"
                  aria-label="Add artifacts"
                >
                  <Button
                    type="button"
                    variant="secondary"
                    label="Add link"
                    icon="leading"
                    iconName="link"
                    size="sm"
                    disabled={artifacts.length >= 10}
                    onClick={() => {
                      if (artifacts.length >= 10) return;
                      setAddLinkModalOpen(true);
                    }}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    label="Upload file"
                    icon="leading"
                    iconName="upload"
                    size="sm"
                    disabled={artifacts.length >= 10}
                    onClick={() => {
                      if (artifacts.length >= 10) return;
                      setUploadModalOpen(true);
                    }}
                  />
                </div>
                {step1SubmitAttempted && artifacts.length === 0 ? (
                  <p
                    role="alert"
                    style={{
                      margin: 0,
                      fontSize: 12,
                      fontWeight: 400,
                      lineHeight: 1.5,
                      letterSpacing: "0.24px",
                      color: TOKENS.error,
                    }}
                  >
                    At least one artifact is required
                  </p>
                ) : null}
                {step1SubmitAttempted && artifacts.length > 0 && !artifactsValid ? (
                  <p
                    role="alert"
                    style={{
                      margin: 0,
                      fontSize: 12,
                      fontWeight: 400,
                      lineHeight: 1.5,
                      letterSpacing: "0.24px",
                      color: TOKENS.error,
                    }}
                  >
                    Complete each artifact name, version, and file or valid link
                  </p>
                ) : null}
                {artifacts.length > 0 && (
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {artifacts.map((a, idx) => (
                      <ArtifactPreview
                        key={a.localKey}
                        size="large"
                        compact
                        fileType={getFileType(a)}
                        mode="editable"
                        showDetails={true}
                        fileName={
                          a.kind === "file"
                            ? a.file?.name ?? "Untitled"
                            : a.title || a.linkUrl || "Untitled"
                        }
                        lastEdited="Just uploaded"
                        artifactName={a.title}
                        iteration={formatVersionLabel(a.versionNumber)}
                        description={a.description}
                        iterationOptions={VERSION_LABEL_OPTIONS}
                        imageUrl={artifactPreviews[a.localKey]}
                        linkUrl={a.kind === "link" ? a.linkUrl : undefined}
                        figmaFileMeta={figmaMetaMap[a.localKey] ?? null}
                        onArtifactNameChange={(name) =>
                          setArtifacts((prev) =>
                            prev.map((x, i) => (i === idx ? { ...x, title: name } : x))
                          )
                        }
                        onIterationChange={(iteration) =>
                          setArtifacts((prev) =>
                            prev.map((x, i) => {
                              if (i !== idx) return x;
                              const label = formatVersionLabel(iteration);
                              return {
                                ...x,
                                iterationLabel: label,
                                versionNumber: label,
                              };
                            })
                          )
                        }
                        onDescriptionChange={(description) =>
                          setArtifacts((prev) =>
                            prev.map((x, i) => {
                              if (i !== idx) return x;
                              const next = { ...x, description };
                              if (x.descriptionAiState === "ai_generated") {
                                next.descriptionAiState = "edited";
                              }
                              return next;
                            })
                          )
                        }
                        descriptionAiState={a.descriptionAiState ?? "idle"}
                        showOptimiseButton={false}
                        onRegenerateDescription={undefined}
                        onMinimise={() => removeArtifactByKey(a.localKey)}
                        highlightNameError={step1SubmitAttempted && !a.title.trim()}
                        highlightIterationError={
                          step1SubmitAttempted && !a.iterationLabel.trim()
                        }
                      />
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : currentStep === 2 ? (
            <div className="flex min-w-0 w-full flex-col" style={{ gap: 24 }}>
              {/* Related project (outside-project variant) */}
              {!projectScoped && (
                <div className="relative w-full">
                  <Select
                    label="Project"
                    required
                    portaled
                    closeOnScroll
                    options={projectMenuOptions.map((p) => ({
                      value: p.id,
                      label: p.name
                    }))}
                    value={selectedRelatedProjectId || undefined}
                    onChange={(id) => onSelectedRelatedProjectIdChange(id)}
                    placeholder="Select related project"
                    size="sm"
                    errorText={
                      relatedProjectFieldError ? "Related project is required" : undefined
                    }
                  />
                </div>
              )}

              <Input
                ref={titleInputRef}
                fieldId={titleFieldId}
                type="text"
                label="Review title"
                required
                value={reviewTitle}
                onChange={(e) => {
                  titleIsAiGenerated.current = false;
                  setReviewTitle(e.target.value);
                }}
                placeholder={
                  reviewTitleGenerating
                    ? "Generating title…"
                    : "e.g. Navigation Review"
                }
                size="sm"
                disabled={reviewTitleGenerating}
                error={titleFieldError}
                errorMessage="Review title is required"
              />

              {/* Review type */}
              <div className="flex flex-col gap-2">
                <Select
                  label="Review type"
                  portaled
                  closeOnScroll
                  options={REVIEW_TYPE_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label,
                    disabled: o.value === "compare" && artifacts.length < 2,
                    title:
                      o.value === "compare" && artifacts.length < 2
                        ? "Add at least 2 artifacts to use Compare"
                        : undefined,
                  }))}
                  value={reviewType}
                  onChange={(v) => {
                    if (v === "compare" && artifacts.length < 2) return;
                    reviewTypeIsAiSuggested.current = false;
                    setReviewType(v as ReviewType);
                  }}
                  placeholder="Select type"
                  size="sm"
                />
                <p
                  style={{
                    margin: 0,
                    fontSize: 12,
                    fontWeight: 400,
                    lineHeight: 1.45,
                    color: TOKENS.secondary,
                  }}
                >
                  {REVIEW_TYPE_HELPER_TEXT[reviewType]}
                </p>
              </div>

              <div className="flex min-w-0 w-full flex-col" style={{ gap: 8 }}>
                <div ref={reviewerBlockRef} className="relative min-w-0 w-full">
                  <SelectField
                    label="Add reviewers"
                    required
                    type="searchable"
                    size="sm"
                    placeholder="Find teammates"
                    searchValue={reviewerQuery}
                    onSearchChange={(q: string) => {
                      setReviewerQuery(q);
                      setReviewerMenuOpen(true);
                    }}
                    isOpen={reviewerMenuOpen}
                    onOpen={() => setReviewerMenuOpen(true)}
                    fieldId={reviewersFieldId}
                    aria-controls={reviewerMenuOpen ? reviewersListboxId : undefined}
                    error={reviewersFieldError}
                    errorMessage="Reviewers is required"
                    helperText={
                      reviewType === "compare"
                        ? "The first reviewer selected is the final decision maker. Reviewers will select a preferred concept and provide feedback."
                        : undefined
                    }
                    showHelper={reviewType === "compare" && !reviewersFieldError}
                  />
                  <Menu
                    id={reviewersListboxId}
                    open={reviewerMenuOpen}
                    onClose={() => setReviewerMenuOpen(false)}
                    type="multi-select"
                    anchorRef={reviewerBlockRef}
                    align="left"
                    aria-label="Teammate options"
                    footerAction={{
                      type: "button",
                      label: "Done",
                      onClick: () => setReviewerMenuOpen(false),
                      additionalLinkLabel: "Create a new teammate",
                      showAdditionalLink: true,
                      onAdditionalLink: () => {
                        setReviewerMenuOpen(false);
                        setCreateTeammateModalOpen(true);
                      }
                    }}
                  >
                    {reviewerMenuPeople.length === 0 ? (
                      <MenuItem
                        label="No teammates found"
                        disabled
                        onClick={() => {}}
                      />
                    ) : null}
                    {!effectiveProjectId.trim() ? (
                      reviewerMenuPeople.map((u) => (
                        <MenuItem
                          key={u.id}
                          label={u.name}
                          labelSuffix={u.isPending ? "pending" : undefined}
                          avatarSrc={u.avatarUrl ?? undefined}
                          avatarName={u.name}
                          avatarContributorId={u.id}
                          avatarContributorEmail={u.email}
                          checkbox
                          active={reviewerExclude.has(u.id)}
                          onClick={() => {
                            setReviewers((prev) =>
                              prev.some((r) => r.id === u.id)
                                ? prev.filter((r) => r.id !== u.id)
                                : [...prev, u]
                            );
                          }}
                        />
                      ))
                    ) : reviewerPickerSections?.showSectionHeadings ? (
                      <>
                        <MenuSectionHeading>Project teammates</MenuSectionHeading>
                        {reviewerPickerSections.projectTeammates.map((u) => (
                          <MenuItem
                            key={`project-${u.id}`}
                            label={u.name}
                          labelSuffix={u.isPending ? "pending" : undefined}
                            avatarSrc={u.avatarUrl ?? undefined}
                            avatarName={u.name}
                            avatarContributorId={u.id}
                          avatarContributorEmail={u.email}
                            checkbox
                            active={reviewerExclude.has(u.id)}
                            onClick={() => {
                              setReviewers((prev) =>
                                prev.some((r) => r.id === u.id)
                                  ? prev.filter((r) => r.id !== u.id)
                                  : [...prev, u]
                              );
                            }}
                          />
                        ))}
                        <MenuSectionHeading>All members</MenuSectionHeading>
                        {reviewerPickerSections.otherWorkspaceMembers.map((u) => (
                          <MenuItem
                            key={`workspace-${u.id}`}
                            label={u.name}
                          labelSuffix={u.isPending ? "pending" : undefined}
                            avatarSrc={u.avatarUrl ?? undefined}
                            avatarName={u.name}
                            avatarContributorId={u.id}
                          avatarContributorEmail={u.email}
                            checkbox
                            active={reviewerExclude.has(u.id)}
                            onClick={() => {
                              setReviewers((prev) =>
                                prev.some((r) => r.id === u.id)
                                  ? prev.filter((r) => r.id !== u.id)
                                  : [...prev, u]
                              );
                            }}
                          />
                        ))}
                      </>
                    ) : (
                      reviewerMenuPeople.map((u) => (
                        <MenuItem
                          key={u.id}
                          label={u.name}
                          labelSuffix={u.isPending ? "pending" : undefined}
                          avatarSrc={u.avatarUrl ?? undefined}
                          avatarName={u.name}
                          avatarContributorId={u.id}
                          avatarContributorEmail={u.email}
                          checkbox
                          active={reviewerExclude.has(u.id)}
                          onClick={() => {
                            setReviewers((prev) =>
                              prev.some((r) => r.id === u.id)
                                ? prev.filter((r) => r.id !== u.id)
                                : [...prev, u]
                            );
                          }}
                        />
                      ))
                    )}
                  </Menu>
                </div>
                {reviewers.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {reviewers.map((user, idx) => {
                      const isDecisionMaker = idx === 0 && reviewType === "compare";
                      const chipInner = (
                        <div
                          onMouseEnter={() => setHoveredChipId(user.id)}
                          onMouseLeave={() => setHoveredChipId(null)}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 8,
                            height: 32,
                            paddingLeft: 8,
                            paddingRight: 8,
                            borderRadius: 4,
                            border: `1px solid ${
                              hoveredChipId === user.id
                                ? isDecisionMaker
                                  ? "#c490c8"
                                  : "#e8d0d4"
                                : isDecisionMaker
                                  ? "#d9a8dc"
                                  : "#e4ddd3"
                            }`,
                            backgroundColor:
                              hoveredChipId === user.id
                                ? isDecisionMaker
                                  ? "#f0e2f1"
                                  : "#f5eaec"
                                : isDecisionMaker
                                  ? "#f5e8f6"
                                  : "#f3efe9",
                            flexShrink: 0,
                            transition:
                              "background-color 120ms ease, border-color 120ms ease"
                          }}
                        >
                          <Avatar
                            name={user.name}
                            contributorId={user.id}
                            size="md"
                            prominence="high"
                            style={getAvatarInlineStyle(
                              avatarColourKey(user.email, user.id),
                              { ring: true },
                            )}
                          />
                          <span
                            style={{
                              fontSize: 13,
                              fontWeight: 500,
                              color: "#6b5e55",
                              whiteSpace: "nowrap"
                            }}
                          >
                            {user.name}
                          </span>
                          {isDecisionMaker && (
                            <Icon
                              name="info"
                              size={16}
                              style={{ color: "#998c82", flexShrink: 0 }}
                            />
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setReviewers((prev) => prev.filter((r) => r.id !== user.id))
                            }
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              background: "none",
                              border: "none",
                              padding: 0,
                              cursor: "pointer",
                              color: "#998c82",
                              flexShrink: 0
                            }}
                            aria-label={`Remove ${user.name}`}
                          >
                            <Icon name="close" size={16} />
                          </button>
                        </div>
                      );
                      return isDecisionMaker ? (
                        <Tooltip
                          key={user.id}
                          label="This person is the final decision maker"
                          position="top"
                        >
                          {chipInner}
                        </Tooltip>
                      ) : (
                        <Fragment key={user.id}>{chipInner}</Fragment>
                      );
                    })}
                  </div>
                )}
                <Checkbox
                  id={notifyFieldId}
                  label="Send notification on create"
                  checked={sendNotification}
                  onChange={handleSendNotificationChange}
                />
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 w-full flex-col" style={{ gap: 24 }}>
              <div className="flex flex-col" style={{ gap: 6 }}>
                <div className="relative w-full" ref={sourcesSelectRef}>
                  <SelectField
                    label="Related sources"
                    type="single"
                    size="sm"
                    placeholder="Select relevant project sources"
                    selectedLabel={undefined}
                    isOpen={sourcesSelectOpen}
                    onOpen={() => setSourcesSelectOpen((prev) => !prev)}
                    fieldId={sourcesFieldId}
                  />
                  <Menu
                    open={sourcesSelectOpen}
                    onClose={() => {
                      setSourcesSelectOpen(false);
                    }}
                    type="multi-select"
                    anchorRef={sourcesSelectRef}
                    align="left"
                    aria-label="Source options"
                    footerAction={{
                      type: "button",
                      label: "Done",
                      onClick: () => {
                        setSourcesSelectOpen(false);
                      },
                      additionalLinkLabel: "Add a new source",
                      showAdditionalLink: true,
                      onAdditionalLink: () => {
                        sourceFileInputRef.current?.click();
                      },
                    }}
                  >
                    {availableSources.map((source) => {
                      const label =
                        source.label?.trim() ||
                        source.file_name ||
                        "Untitled";
                      return (
                        <MenuItem
                          key={source.id}
                          label={label}
                          checkbox
                          active={relatedSources.includes(source.id)}
                          onClick={() => {
                            setRelatedSources((prev) =>
                              prev.includes(source.id)
                                ? prev.filter((id) => id !== source.id)
                                : [...prev, source.id]
                            );
                          }}
                        />
                      );
                    })}
                  </Menu>
                  <input
                    ref={sourceFileInputRef}
                    type="file"
                    className="hidden"
                    tabIndex={-1}
                    aria-hidden
                    onChange={(e) => {
                      void (async () => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        if (!file) return;
                        const projectId = effectiveProjectId.trim();
                        if (!projectId) return;
                        try {
                          const source = await uploadProjectSourceFile(
                            projectId,
                            file
                          );
                          setAvailableSources((prev) =>
                            prev.some((row) => row.id === source.id)
                              ? prev
                              : [...prev, source]
                          );
                          setRelatedSources((prev) =>
                            prev.includes(source.id)
                              ? prev
                              : [...prev, source.id]
                          );
                          const sourceLabel =
                            source.label?.trim() ||
                            source.file_name ||
                            "Untitled";
                          void logTimelineEventClient({
                            projectId,
                            eventType: "source_added",
                            payload: {
                              source_label: sourceLabel,
                              source_type:
                                source.storage_path != null &&
                                String(source.storage_path).trim() !== ""
                                  ? "file"
                                  : "link",
                            },
                          });
                        } catch {
                          // uploadProjectSourceFile logs storage failures
                        }
                      })();
                    }}
                  />
                </div>
                {relatedSources.length > 0 && (
                  <div className="mt-1 flex w-full flex-col gap-1">
                    {relatedSources.map((id) => {
                      const source = availableSources.find((s) => s.id === id);
                      if (!source) return null;
                      const label =
                        source.label?.trim() ||
                        source.file_name ||
                        "Untitled";
                      const hovered = hoveredSourceRowId === id;
                      return (
                        <div
                          key={id}
                          className="w-full"
                          onMouseEnter={() => setHoveredSourceRowId(id)}
                          onMouseLeave={() => setHoveredSourceRowId(null)}
                        >
                          <Tag
                            label={label}
                            variant={hovered ? "brand" : "default"}
                            size="md"
                            icon={hovered ? "removable" : "none"}
                            onRemove={() =>
                              setRelatedSources((prev) =>
                                prev.filter((x) => x !== id)
                              )
                            }
                            className="w-full"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-col" style={{ gap: 6 }}>
                <div className="relative w-full" ref={problemsSelectRef}>
                  <SelectField
                    label="Related problems"
                    type="single"
                    size="sm"
                    placeholder="Select relevant project problems"
                    selectedLabel={undefined}
                    isOpen={problemsSelectOpen}
                    onOpen={() => setProblemsSelectOpen((prev) => !prev)}
                    fieldId={problemsFieldId}
                  />
                  <Menu
                    open={problemsSelectOpen}
                    onClose={() => {
                      setProblemsSelectOpen(false);
                    }}
                    type="multi-select"
                    anchorRef={problemsSelectRef}
                    align="left"
                    aria-label="Problem options"
                    footerAction={{
                      type: "button",
                      label: "Done",
                      onClick: () => {
                        setProblemsSelectOpen(false);
                      },
                      additionalLinkLabel: "Create new problem",
                      showAdditionalLink: true,
                      onAdditionalLink: () => {
                        setProblemsSelectOpen(false);
                        setCreateProblemModalOpen(true);
                      },
                    }}
                  >
                    {availableProblems.length > 0
                      ? availableProblems.map((p) => (
                          <MenuItem
                            key={p.id}
                            label={p.description ?? p.id}
                            checkbox
                            active={relatedProblems.includes(p.id)}
                            onClick={() => {
                              setRelatedProblems((prev) =>
                                prev.includes(p.id)
                                  ? prev.filter((id) => id !== p.id)
                                  : [...prev, p.id]
                              );
                            }}
                          />
                        ))
                      : (
                          <MenuItem
                            label="No problems added yet"
                            disabled
                            onClick={() => {}}
                          />
                        )}
                  </Menu>
                </div>
                {relatedProblems.length > 0 && (
                  <div className="mt-1 flex w-full flex-col gap-1">
                    {relatedProblems.map((id) => {
                      const problem = availableProblems.find((p) => p.id === id);
                      if (!problem) return null;
                      const text = problem.description ?? id;
                      const hovered = hoveredProblemRowId === id;
                      return (
                        <div
                          key={id}
                          className="w-full"
                          onMouseEnter={() => setHoveredProblemRowId(id)}
                          onMouseLeave={() => setHoveredProblemRowId(null)}
                        >
                          <Tag
                            label={text}
                            variant={hovered ? "brand" : "default"}
                            size="md"
                            icon={hovered ? "removable" : "none"}
                            onRemove={() =>
                              setRelatedProblems((prev) =>
                                prev.filter((x) => x !== id)
                              )
                            }
                            className="w-full"
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="flex flex-col" style={{ gap: 6 }}>
                <p
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    lineHeight: 1.5,
                    letterSpacing: "0.26px",
                    color: "#2e1c1c",
                    margin: 0
                  }}
                >
                  Related tradeoffs
                </p>
                {tradeoffsGenerating ? (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      fontWeight: 400,
                      lineHeight: 1.5,
                      letterSpacing: "0.24px",
                      color: TOKENS.secondary,
                    }}
                  >
                    Generating tradeoffs…
                  </p>
                ) : null}
                {aiTradeoffs.length > 0 && (
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 8,
                      marginTop: 4,
                    }}
                  >
                    {aiTradeoffs.map((t, idx) => (
                      <TradeoffCard
                        key={idx}
                        label={t.description || "(empty tradeoff)"}
                        severity={t.severity}
                        artifactLabel={t.artifactLabel || undefined}
                        layout="stacked"
                        interactive
                        clampLines={3}
                        onRemove={() =>
                          setAiTradeoffs((prev) => prev.filter((_, i) => i !== idx))
                        }
                      />
                    ))}
                  </div>
                )}
                <div className="flex flex-wrap" style={{ gap: 8 }}>
                  <Button
                    type="button"
                    variant="secondary"
                    label="Add a tradeoff"
                    icon="leading"
                    iconName="plus"
                    size="sm"
                    onClick={() => setTradeoffModalOpen(true)}
                  />
                </div>
              </div>

              <div className="flex flex-col" style={{ gap: 6 }}>
                <TextareaAi
                  id={focusFieldId}
                  label="Review focus*"
                  size="sm"
                  variant="form-fixed"
                  hideIdleAiFooter
                  placeholder={
                    reviewFocusGenerating
                      ? "Generating review focus…"
                      : "What initial focus or questions do you have for the reviewers?"
                  }
                  value={reviewFocus}
                  onChange={(e) => {
                    if (reviewFocusAiGenerated) {
                      setReviewFocusAiGenerated(false);
                      setReviewFocusStale(false);
                      reviewFocusSnapshotRef.current = null;
                    }
                    setReviewFocus(e.target.value);
                  }}
                  generating={reviewFocusGenerating}
                />
                {showFocusGenerateButton ||
                showFocusRegenerateButton ||
                showFocusOptimiseButton ? (
                  <div className="flex items-center justify-end gap-2">
                    {showFocusGenerateButton ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        icon="leading"
                        iconName={
                          reviewFocusGeneratingAction === "regenerate"
                            ? "loading"
                            : "ai-stars"
                        }
                        label={
                          reviewFocusGeneratingAction === "regenerate"
                            ? "Generating…"
                            : "Generate with Ai"
                        }
                        disabled={
                          focusButtonDisabled || reviewFocusGenerating
                        }
                        onClick={() => {
                          void runReviewFocusGeneration(artifacts, "regenerate");
                        }}
                      />
                    ) : null}
                    {showFocusRegenerateButton ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        icon="leading"
                        iconName={
                          reviewFocusGeneratingAction === "regenerate"
                            ? "loading"
                            : "ai-stars"
                        }
                        label={
                          reviewFocusGeneratingAction === "regenerate"
                            ? "Re-generating…"
                            : "Re-generate with Ai"
                        }
                        disabled={
                          focusButtonDisabled || reviewFocusGenerating
                        }
                        onClick={() => {
                          void runReviewFocusGeneration(artifacts, "regenerate");
                        }}
                      />
                    ) : null}
                    {showFocusOptimiseButton ? (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        icon="leading"
                        iconName={
                          reviewFocusGeneratingAction === "optimise"
                            ? "loading"
                            : "ai-stars"
                        }
                        label={
                          reviewFocusGeneratingAction === "optimise"
                            ? "Generating…"
                            : "Optimise with Ai"
                        }
                        disabled={
                          focusButtonDisabled || reviewFocusGenerating
                        }
                        onClick={() => {
                          void runReviewFocusGeneration(artifacts, "optimise");
                        }}
                      />
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>
          )}
      </div>
    </Drawer>

    <Modal
      open={createTeammateModalOpen}
      type="form"
      size="md"
      title="Create a new teammate"
      onClose={closeCreateTeammateModal}
      footer={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            width: "100%",
            gap: 8
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Checkbox
              id={includeTeammateCheckboxId}
              label="Include person within the project team"
              checked={includeTeammateInProject}
              disabled={!effectiveProjectId.trim()}
              onChange={setIncludeTeammateInProject}
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            label="Cancel"
            onClick={closeCreateTeammateModal}
          />
          <Button
            variant="accent"
            size="sm"
            label={isCreatingTeammate ? "Creating…" : "Create"}
            disabled={
              !newTeammateName.trim() ||
              Boolean(teammateEmailExistsError) ||
              isCreatingTeammate ||
              (includeTeammateInProject && !effectiveProjectId.trim())
            }
            onClick={async () => {
              const name = newTeammateName.trim();
              const email = newTeammateEmail.trim();
              if (!name || teammateEmailExistsError || isCreatingTeammate) return;
              if (includeTeammateInProject && !effectiveProjectId.trim()) return;
              setIsCreatingTeammate(true);
              const supabase = createSupabaseBrowserClient();
              const activeWorkspaceId = await getActiveWorkspaceId(supabase);

              const storedPermissionLevel = toStoredPermissionLevel(
                newTeammatePermissionLevel,
                false,
              );

              if (includeTeammateInProject && email && activeWorkspaceId) {
                const inviteResult = await sendWorkspaceInvite({
                  workspace_id: activeWorkspaceId,
                  email,
                  name,
                  role: newTeammateRole.trim() || undefined,
                  permission_level: storedPermissionLevel,
                });
                if (inviteResult.status === "error") {
                  setIsCreatingTeammate(false);
                  showToast(inviteToastMessage(inviteResult, name, email));
                  return;
                }
                showToast(inviteToastMessage(inviteResult, name, email));
              }

              const { data, error } = await (async () => {
                if (activeWorkspaceId) {
                  const normalizedEmail = email.trim().toLowerCase();
                  let contributorId: string | null = null;

                  if (normalizedEmail) {
                    const { data: existing } = await supabase
                      .from("contributors")
                      .select("id")
                      .eq("workspace_id", activeWorkspaceId)
                      .ilike("email", normalizedEmail)
                      .is("project_id", null)
                      .maybeSingle();
                    contributorId = String(
                      (existing as { id?: string } | null)?.id ?? "",
                    ).trim() || null;
                  }

                  if (!contributorId) {
                    const { data: newRow, error: insertError } = await supabase
                      .from("contributors")
                      .insert({
                        workspace_id: activeWorkspaceId,
                        project_id: null,
                        name,
                        email: email || null,
                        role: newTeammateRole.trim() || "Stakeholder",
                        permission_level: storedPermissionLevel,
                        is_paid: isPaidPermissionLevel(storedPermissionLevel),
                      })
                      .select("id, name, email, role")
                      .single();
                    if (insertError || !newRow) {
                      return { data: null, error: insertError };
                    }
                    contributorId = String(
                      (newRow as { id?: string }).id ?? "",
                    ).trim();
                  }

                  if (
                    includeTeammateInProject &&
                    effectiveProjectId.trim() &&
                    contributorId
                  ) {
                    const linked = await linkContributorToProject(supabase, {
                      projectId: effectiveProjectId.trim(),
                      workspaceId: activeWorkspaceId,
                      contributorId,
                      name,
                      email: email || null,
                      role: newTeammateRole.trim() || "Stakeholder",
                      permissionLevel: storedPermissionLevel,
                      isPaid: isPaidPermissionLevel(storedPermissionLevel),
                    });
                    if (linked) {
                      return {
                        data: {
                          id: linked.id,
                          name: linked.name,
                          email: linked.email,
                          role: linked.role,
                        },
                        error: null,
                      };
                    }
                  }

                  if (contributorId) {
                    const { data: row, error: fetchError } = await supabase
                      .from("contributors")
                      .select("id, name, email, role")
                      .eq("id", contributorId)
                      .maybeSingle();
                    return { data: row, error: fetchError };
                  }

                  return { data: null, error: null };
                }

                return supabase
                  .from("contributors")
                  .insert({
                    project_id:
                      includeTeammateInProject && effectiveProjectId.trim()
                        ? effectiveProjectId.trim()
                        : null,
                    workspace_id: null,
                    name,
                    email: email || null,
                    role: newTeammateRole.trim() || "Stakeholder",
                    permission_level: storedPermissionLevel,
                    is_paid: isPaidPermissionLevel(storedPermissionLevel),
                  })
                  .select("id, name, email, role")
                  .single();
              })();
              setIsCreatingTeammate(false);
              if (error) {
                console.error("[create-teammate]", error);
                return;
              }
              if (!data) return;
              const row = data as Record<string, unknown>;
              const newUser: User = {
                id: String(row.id ?? ""),
                name: String(row.name ?? ""),
                email:
                  row.email == null || String(row.email).trim() === ""
                    ? null
                    : String(row.email),
                avatarUrl: null
              };
              if (!newUser.id) return;
              setAvailableTeammates((prev) =>
                prev.some((u) => u.id === newUser.id) ? prev : [...prev, newUser]
              );
              setReviewers((prev) =>
                prev.some((r) => r.id === newUser.id) ? prev : [...prev, newUser]
              );
              if (includeTeammateInProject && effectiveProjectId.trim()) {
                await logTimelineEventClient({
                  projectId: effectiveProjectId.trim(),
                  actorId: newUser.id,
                  eventType: "teammate_added",
                  payload: { teammate_name: newUser.name }
                });
              }
              if (!includeTeammateInProject || !email || !activeWorkspaceId) {
                showToast("Changes saved");
              }
              router.refresh();
              closeCreateTeammateModal();
            }}
          />
        </div>
      }
    >
      <Input
        fieldId={createTeammateNameFieldId}
        label="Name"
        size="sm"
        placeholder="Full name"
        value={newTeammateName}
        onChange={(e) => setNewTeammateName(e.target.value)}
      />
      <Input
        fieldId={createTeammateEmailFieldId}
        label="Email Address"
        size="sm"
        type="email"
        placeholder="email@example.com"
        value={newTeammateEmail}
        onChange={(e) => setNewTeammateEmail(e.target.value)}
        error={Boolean(teammateEmailExistsError)}
        errorMessage={teammateEmailExistsError ?? undefined}
      />
      <Select
        label="Role"
        size="sm"
        portaled
        placeholder="Select"
        options={[...TEAMMATE_ROLE_SELECT_OPTIONS]}
        value={newTeammateRole || undefined}
        onChange={(v) => setNewTeammateRole(v)}
      />
      <Select
        label="Permission Level"
        size="sm"
        portaled
        placeholder="Select"
        options={[...TEAMMATE_PERMISSION_SELECT_OPTIONS]}
        value={newTeammatePermissionLevel}
        onChange={(v) =>
          setNewTeammatePermissionLevel(v as ContentPermissionLevel)
        }
      />
    </Modal>

    <Modal
      open={createProblemModalOpen}
      type="form"
      size="md"
      title="Create a new problem"
      onClose={closeCreateProblemModal}
      footer={
        <div
          style={{
            display: "flex",
            alignItems: "center",
            width: "100%",
            gap: 8
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <Checkbox
              id={includeNewProblemCheckboxId}
              label="Include problem within project details"
              checked={includeNewProblemInProject}
              disabled={!effectiveProjectId.trim()}
              onChange={setIncludeNewProblemInProject}
            />
          </div>
          <Button
            variant="secondary"
            size="sm"
            label="Cancel"
            onClick={closeCreateProblemModal}
          />
          <Button
            variant="accent"
            size="sm"
            label={isCreatingProblem ? "Creating…" : "Create"}
            disabled={
              !newProblemDescription.trim() ||
              isCreatingProblem ||
              (includeNewProblemInProject && !effectiveProjectId.trim())
            }
            onClick={async () => {
              const text = newProblemDescription.trim();
              if (!text || isCreatingProblem) return;
              if (includeNewProblemInProject && !effectiveProjectId.trim()) return;
              setIsCreatingProblem(true);
              const newId = crypto.randomUUID();
              const nextProblem: ProjectProblem = { id: newId, description: text };
              if (includeNewProblemInProject && effectiveProjectId.trim()) {
                const supabase = createSupabaseBrowserClient();
                const { error } = await supabase.from("problems").insert({
                  id: newId,
                  project_id: effectiveProjectId.trim(),
                  description: text
                });
                setIsCreatingProblem(false);
                if (error) {
                  console.error("[create-problem]", error);
                  return;
                }
              } else {
                setReviewSpecificProblemIds((prev) =>
                  prev.includes(newId) ? prev : [...prev, newId],
                );
                setIsCreatingProblem(false);
              }
              setAvailableProblems((prev) => [...prev, nextProblem]);
              setRelatedProblems((prev) =>
                prev.includes(newId) ? prev : [...prev, newId]
              );
              showToast("Changes saved");
              router.refresh();
              closeCreateProblemModal();
            }}
          />
        </div>
      }
    >
      <Textarea
        id={createProblemTextareaId}
        label="Describe the problem or assumption that has been identified"
        showLabel
        size="md"
        variant="form-fixed"
        placeholder="Who feels what, about what, and faces what obstacle?"
        value={newProblemDescription}
        onChange={(e) => setNewProblemDescription(e.target.value)}
      />
    </Modal>

    {/*
      STEP 0 — Shared artifact modals (Create Review Step 1):
      Triggers: Add link / Upload file buttons in Step 1.
      projectId: effectiveProjectId (null hides Related Artifact in shared modals).
      reviewId: null — create flow always uses cross-review major increment; no write-back.
      onSave -> addArtifactFromModal() updates local Step 1 artifact state.
    */}
    <AddLinkModal
      open={addLinkModalOpen}
      projectId={artifactModalProjectId}
      reviewId={null}
      defaultTitle={`Concept ${artifacts.length + 1}`}
      onClose={() => setAddLinkModalOpen(false)}
      onSave={(payload) => {
        addArtifactFromModal(payload);
        setAddLinkModalOpen(false);
      }}
    />

    <UploadModal
      open={uploadModalOpen}
      projectId={artifactModalProjectId}
      reviewId={null}
      defaultTitle={`Concept ${artifacts.length + 1}`}
      onClose={() => setUploadModalOpen(false)}
      onSave={(payload) => {
        addArtifactFromModal(payload);
        setUploadModalOpen(false);
      }}
    />
    <Modal
      open={tradeoffModalOpen}
      type="form"
      size="md"
      title="Create a tradeoff"
      onClose={closeTradeoffModal}
      footer={
        <>
          <div style={{ flex: 1, minWidth: 0 }} />
          <Button
            variant="secondary"
            size="sm"
            label="Cancel"
            onClick={closeTradeoffModal}
          />
          {newTradeoffText.trim() ? (
            <Button
              variant="accent"
              size="sm"
              label="Create"
              onClick={handleConfirmAddTradeoff}
            />
          ) : (
            <Tooltip label="Add a description to continue" position="top">
              <span style={{ display: "inline-flex" }}>
                <Button
                  variant="accent"
                  size="sm"
                  label="Create"
                  disabled
                  aria-disabled
                />
              </span>
            </Tooltip>
          )}
        </>
      }
    >
      <Textarea
        label="What tradeoff exists?"
        showLabel
        size="md"
        variant="form-fixed"
        placeholder="e.g. Redesigns balance aesthetics and functionality, ensuring user-friendly navigation."
        value={newTradeoffText}
        onChange={(e) => setNewTradeoffText(e.target.value)}
      />
      <Select
        label="Select risk level"
        size="sm"
        portaled
        options={[
          { value: "High", label: "High" },
          { value: "Medium", label: "Medium" },
          { value: "Low", label: "Low" },
        ]}
        value={newTradeoffSeverity}
        onChange={(v) =>
          setNewTradeoffSeverity(v as "High" | "Medium" | "Low")
        }
      />
      {artifacts.length > 0 ? (
        <Select
          label="Related artifact"
          size="sm"
          portaled
          searchable={false}
          creatable={false}
          placeholder="Select an artifact"
          options={artifacts.map((a) => {
            const label = a.title.trim() || a.iterationLabel || "Artifact";
            return { value: label, label };
          })}
          value={newTradeoffArtifactLabel}
          onChange={(v) => setNewTradeoffArtifactLabel(v)}
        />
      ) : null}
    </Modal>
    {artifactToast ? (
      <DrawerArtifactToastPortal key={artifactToast} message={artifactToast} />
    ) : null}
    <DiscardChangesModal
      open={discardOpen}
      onKeepEditing={() => setDiscardOpen(false)}
      onDiscard={() => {
        reset();
        setDiscardOpen(false);
        onClose();
      }}
    />
    <Modal
      open={showDraftWarningModal}
      type="default"
      size="sm"
      title="Save as draft instead?"
      showSubtitle={false}
      backdropClosable={false}
      onClose={() => setShowDraftWarningModal(false)}
      footer={
        <>
          <div className={modalStyles.spacer} />
          <button
            type="button"
            className={modalStyles.btnSecondary}
            onClick={() => setShowDraftWarningModal(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className={modalStyles.btnPrimary}
            onClick={() => {
              setShowDraftWarningModal(false);
              setSendNotification(false);
            }}
          >
            Save as draft
          </button>
        </>
      }
    >
      <p className={modalStyles.description}>
        Without notifying reviewers, this review will be saved as a draft. You can
        publish it and notify reviewers later from the review page.
      </p>
    </Modal>
    </>
  );
}
