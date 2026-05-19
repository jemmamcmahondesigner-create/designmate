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
  type CSSProperties
} from "react";
import { useRouter } from "next/navigation";
import { DiscardChangesModal } from "@/components/DiscardChangesModal";
import { useToast } from "@/components/Toast";
import {
  Alert,
  Avatar,
  ArtifactPreview,
  Button,
  Checkbox,
  Drawer,
  Icon,
  IconSquareButton,
  Input,
  Modal,
  Menu,
  MenuItem,
  Select,
  SelectField,
  Tag,
  Textarea,
  TextareaAi,
  Tooltip
} from "@/components/ui/ds";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getActiveWorkspaceId } from "@/lib/workspace/activeWorkspace";
import { sendWorkspaceInvite } from "@/lib/workspace/invite-client";
import { inviteToastMessage } from "@/lib/workspace/invite-toast";
import { logTimelineEventClient } from "@/lib/timeline/logEventClient";
import type {
  ArtifactDraftForSubmit,
  SubmitReviewInput
} from "@/lib/reviews/submitReviewClient";
import { generateArtifactDescription } from "@/app/actions/generateArtifactDescription";
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
  { value: "compare", label: "Compare" },
  { value: "critique", label: "Critique" },
  { value: "align", label: "Align" },
  { value: "approve", label: "Approve" }
];

/** v1…vN for in-card version selector (Create Review step 1). */
const VERSION_LABEL_OPTIONS = Array.from(
  { length: 30 },
  (_, i) => `v${i + 1}`
);

const RELATED_NEW = "__new__";

const TEAMMATE_ROLE_SELECT_OPTIONS = [
  { value: "Designer", label: "Designer" },
  { value: "Product Manager", label: "Product Manager" },
  { value: "Engineer", label: "Engineer" },
  { value: "Stakeholder", label: "Stakeholder" }
] as const;

const ACCEPTED_MIME_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "image/svg+xml",
  "application/pdf"
].join(",");

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

function formatFileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isValidHttpUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

function isFigmaUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === "www.figma.com" || u.hostname === "figma.com";
  } catch {
    return false;
  }
}

function buildFigmaEmbedUrl(url: string): string {
  try {
    const embedUrl = new URL(url);
    embedUrl.hostname = "embed.figma.com";
    if (embedUrl.pathname.startsWith("/file/")) {
      embedUrl.pathname = embedUrl.pathname.replace("/file/", "/design/");
    }
    embedUrl.searchParams.set("embed-host", "designmate");
    return embedUrl.toString();
  } catch {
    return url;
  }
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
  versionNumber: number;
  /** When adding from an existing canonical artifact; null = new artifact on submit. */
  resolvedArtifactId: string | null;
  descriptionAiState?: ArtifactDescriptionState;
  /** Session-only — tracks whether the current description came from AI (for submit payload if needed later). */
  aiGenerated?: boolean;
};

type ModalDraftState = {
  /** Empty string = no selection (placeholder). RELATED_NEW = explicit “New artifact”. */
  relatedArtifactId: typeof RELATED_NEW | "" | string;
  linkUrl: string;
  title: string;
  versionNumber: number;
  /** Max version index allowed in the Version select (1…ceiling as v1…vN). */
  versionCeiling: number;
  description: string;
  file: File | null;
};

function getEmptyModalDraftState(conceptTitle: string): ModalDraftState {
  return {
    relatedArtifactId: "",
    linkUrl: "",
    title: conceptTitle,
    versionNumber: 1,
    versionCeiling: 1,
    description: "",
    file: null,
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

type TradeoffSentimentStyle = {
  bg: string;
  border: string;
  pillBg: string;
  pillFg: string;
};

function tradeoffSentimentStyle(
  severity: "High" | "Medium" | "Low",
): TradeoffSentimentStyle {
  if (severity === "High") {
    return { bg: "#fceaea", border: "#e07070", pillBg: "#c94040", pillFg: "#ffffff" };
  }
  if (severity === "Medium") {
    return { bg: "#fef8dc", border: "#e5b025", pillBg: "#e0b530", pillFg: "#3d2800" };
  }
  return { bg: "#f3efe9", border: "#e4ddd3", pillBg: "#6b1e2e", pillFg: "#ffffff" };
}

const clamp3TextStyle: CSSProperties = {
  display: "-webkit-box",
  WebkitLineClamp: 3,
  WebkitBoxOrient: "vertical",
  overflow: "hidden",
};

/** 3-line clamp; tooltip only when content overflows the clamp box. */
function Step3ClampText({
  text,
  textStyle,
}: {
  text: string;
  textStyle: CSSProperties;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [overflow, setOverflow] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    setOverflow(el.scrollHeight > el.clientHeight);
  }, [text]);

  const inner = (
    <span
      ref={ref}
      title={overflow ? text : undefined}
      style={{
        ...clamp3TextStyle,
        ...textStyle,
      }}
    >
      {text}
    </span>
  );

  return overflow ? (
    <Tooltip label={text} position="top">
      {inner}
    </Tooltip>
  ) : (
    inner
  );
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

/** Figma oEmbed title is often "FileName · FrameName" (U+00B7 middle dot). */
const FIGMA_OEMBED_TITLE_SEP = " \u00b7 ";

function parseFigmaFrameNameFromOembedTitle(oembedTitle: string): string {
  const t = oembedTitle.trim();
  if (!t) return "";
  const parts = t.split(FIGMA_OEMBED_TITLE_SEP);
  if (parts.length < 2) return t;
  return (parts[parts.length - 1] ?? "").trim() || t;
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
      <Avatar src={user.avatarUrl ?? undefined} name={user.name} size="md" />
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
  const uploadFileInputRef = useRef<HTMLInputElement>(null);
  const drawerBodyRef = useRef<HTMLDivElement>(null);
  const reviewerBlockRef = useRef<HTMLDivElement>(null);
  const problemsSelectRef = useRef<HTMLDivElement>(null);

  const [addLinkModalOpen, setAddLinkModalOpen] = useState(false);
  const addLinkModalBodyRef = useRef<HTMLDivElement>(null);
  const [addLinkBodyScrolled, setAddLinkBodyScrolled] = useState(false);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [modalDescriptionGenerating, setModalDescriptionGenerating] =
    useState(false);
  const [modalDescriptionAiGenerated, setModalDescriptionAiGenerated] =
    useState(false);
  const [relatedArtifactChanged, setRelatedArtifactChanged] = useState(false);
  const [modalOembedRaw, setModalOembedRaw] = useState<string | null>(null);
  const [tradeoffModalOpen, setTradeoffModalOpen] = useState(false);
  const [newTradeoffText, setNewTradeoffText] = useState("");
  const [newTradeoffSeverity, setNewTradeoffSeverity] = useState<
    "High" | "Medium" | "Low"
  >("Medium");
  const [newTradeoffArtifactLabel, setNewTradeoffArtifactLabel] = useState("");
  const [modalDraft, setModalDraft] = useState<ModalDraftState>({
    relatedArtifactId: "",
    linkUrl: "",
    title: "",
    versionNumber: 1,
    versionCeiling: 1,
    description: "",
    file: null
  });
  const modalDraftRef = useRef(modalDraft);
  const modalDescriptionRef = useRef("");
  useEffect(() => {
    modalDraftRef.current = modalDraft;
  }, [modalDraft]);
  const modalDraftResetRef = useRef(false);
  const artifactNameUserEdited = useRef(false);
  const lastAutoFilledArtifactTitleRef = useRef("");
  const modalNameFieldMountedRef = useRef(false);
  const uploadModalNameFieldMountedRef = useRef(false);
  const userHasEditedDescription = useRef(false);
  const [projectArtifacts, setProjectArtifacts] = useState<
    { id: string; name: string }[]
  >([]);

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
  const [reviewFocus, setReviewFocus] = useState("");
  const [step1SubmitAttempted, setStep1SubmitAttempted] = useState(false);
  const [step2SubmitAttempted, setStep2SubmitAttempted] = useState(false);

  const [reviewerQuery, setReviewerQuery] = useState("");
  const [reviewerMenuOpen, setReviewerMenuOpen] = useState(false);
  const [problemsMenuOpen, setProblemsMenuOpen] = useState(false);
  const [problemsSelectOpen, setProblemsSelectOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [artifactToast, setArtifactToast] = useState<string | null>(null);
  const [hoveredChipId, setHoveredChipId] = useState<string | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [createTeammateModalOpen, setCreateTeammateModalOpen] = useState(false);
  const [newTeammateName, setNewTeammateName] = useState("");
  const [newTeammateEmail, setNewTeammateEmail] = useState("");
  const [newTeammateRole, setNewTeammateRole] = useState("");
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
  const [reviewFocusAiGenerated, setReviewFocusAiGenerated] = useState(false);
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
    figmaMetaMapRef.current = figmaMetaMap;
  }, [figmaMetaMap]);

  function abortModalGeneration() {
    modalDraftResetRef.current = true;
    setModalDescriptionGenerating(false);
    setModalDescriptionAiGenerated(false);
    setRelatedArtifactChanged(false);
    userHasEditedDescription.current = false;
    setModalOembedRaw(null);
    modalDescriptionRef.current = "";
    const next = { ...modalDraftRef.current, description: "" };
    modalDraftRef.current = next;
    setModalDraft(next);
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
    setRelatedProblems([]);
    setReviewFocus("");
    setReviewerQuery("");
    setReviewerMenuOpen(false);
    setProblemsMenuOpen(false);
    setProblemsSelectOpen(false);
    setSubmitting(false);
    setToastMessage(null);
    setHoveredChipId(null);
    setAddLinkModalOpen(false);
    setUploadModalOpen(false);
    setModalDescriptionGenerating(false);
    setModalDescriptionAiGenerated(false);
    setRelatedArtifactChanged(false);
    setModalOembedRaw(null);
    setTradeoffModalOpen(false);
    setNewTradeoffText("");
    setNewTradeoffSeverity("Medium");
    setNewTradeoffArtifactLabel("");
    setModalDraft({
      relatedArtifactId: "",
      linkUrl: "",
      title: "",
      versionNumber: 1,
      versionCeiling: 1,
      description: "",
      file: null
    });
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
    setReviewFocusAiGenerated(false);
    setTradeoffsGenerating(false);
    setAiTradeoffs([]);
    artifactNameUserEdited.current = false;
    lastAutoFilledArtifactTitleRef.current = "";
    userHasEditedDescription.current = false;
    modalDescriptionRef.current = "";
    setCreateTeammateModalOpen(false);
    setNewTeammateName("");
    setNewTeammateEmail("");
    setNewTeammateRole("");
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
    if (!effectiveProjectId.trim()) {
      setIncludeTeammateInProject(false);
    } else {
      setIncludeTeammateInProject(true);
    }
  }, [createTeammateModalOpen, effectiveProjectId]);

  useEffect(() => {
    if (!createProblemModalOpen) return;
    if (!effectiveProjectId.trim()) {
      setIncludeNewProblemInProject(false);
    } else {
      setIncludeNewProblemInProject(true);
    }
  }, [createProblemModalOpen, effectiveProjectId]);

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
      abortModalGeneration();
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
    if (!addLinkModalOpen) {
      modalNameFieldMountedRef.current = false;
      return;
    }
    modalNameFieldMountedRef.current = false;
    const id = requestAnimationFrame(() => {
      modalNameFieldMountedRef.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [addLinkModalOpen]);

  useLayoutEffect(() => {
    if (!addLinkModalOpen) {
      setAddLinkBodyScrolled(false);
      return;
    }
    const el = addLinkModalBodyRef.current;
    if (!el) return;
    const onScroll = () => {
      setAddLinkBodyScrolled(el.scrollTop > 0);
    };
    onScroll();
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
    };
  }, [addLinkModalOpen]);

  useEffect(() => {
    if (!uploadModalOpen) {
      uploadModalNameFieldMountedRef.current = false;
      return;
    }
    uploadModalNameFieldMountedRef.current = false;
    const id = requestAnimationFrame(() => {
      uploadModalNameFieldMountedRef.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, [uploadModalOpen]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setProblemsSelectOpen(false);
    }
    if (problemsSelectOpen) {
      document.addEventListener("keydown", onKey);
      return () => document.removeEventListener("keydown", onKey);
    }
  }, [problemsSelectOpen]);

  useEffect(() => {
    setReviewers([]);
  }, [reviewerPoolKey]);

  useEffect(() => {
    setRelatedProblems([]);
  }, [reviewerPoolKey]);

  useEffect(() => {
    setAvailableTeammates(teammateOptions);
  }, [teammateOptions]);

  useEffect(() => {
    setAvailableProblems(projectProblems);
  }, [projectProblems]);

  useEffect(() => {
    if (!open || currentStep !== 2) return;
    if (!effectiveProjectId) return;
    const projectId = effectiveProjectId.trim();
    if (!projectId) return;
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    const q = reviewerQuery.trim();
    const projectContributorIds = new Set(
      teammateOptions
        .map((teammate) => String(teammate.id ?? "").trim())
        .filter(Boolean)
    );
    void (async () => {
      const activeWorkspaceId = await getActiveWorkspaceId(supabase);
      let baseQuery = supabase
        .from("contributors")
        .select("id, name, email, role")
        .order("created_at", { ascending: true });
      if (activeWorkspaceId) {
        baseQuery = baseQuery.eq("workspace_id", activeWorkspaceId);
      }
      const { data } =
        q.length > 0
          ? await baseQuery.ilike("name", `%${reviewerQuery.trim()}%`)
          : await baseQuery;
      if (cancelled) return;
      if (!Array.isArray(data)) {
        setAvailableTeammates([]);
        return;
      }
      const mapped = data.map((row) => {
          const item = row as Record<string, unknown>;
          return {
            id: String(item.id ?? ""),
            name: String(item.name ?? ""),
            email:
              item.email == null || String(item.email).trim() === ""
                ? null
                : String(item.email),
            avatarUrl: null,
          } satisfies User;
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
      const { data } = await supabase
        .from("problems")
        .select("id, description")
        .eq("project_id", projectId)
        .order("created_at", { ascending: true });
      if (cancelled) return;
      if (!Array.isArray(data)) {
        setAvailableProblems([]);
        return;
      }
      setAvailableProblems(
        data.map((row) => {
          const item = row as Record<string, unknown>;
          return {
            id: String(item.id ?? ""),
            description: String(item.description ?? ""),
          } satisfies ProjectProblem;
        })
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [open, currentStep, effectiveProjectId]);

  useEffect(() => {
    if (!open || currentStep !== 1 || !effectiveProjectId?.trim()) {
      setProjectArtifacts([]);
      return;
    }
    let cancelled = false;
    const supabase = createSupabaseBrowserClient();
    const pid = effectiveProjectId.trim();
    void (async () => {
      const { data, error } = await supabase
        .from("artifacts")
        .select("id, name")
        .eq("project_id", pid)
        .order("name", { ascending: true });
      if (cancelled) return;
      if (error) {
        setProjectArtifacts([]);
        return;
      }
      setProjectArtifacts(
        (data ?? []).map((row) => {
          const r = row as Record<string, unknown>;
          return {
            id: String(r.id ?? ""),
            name: String(r.name ?? ""),
          };
        })
      );
    })();
    return () => {
      cancelled = true;
    };
  }, [open, currentStep, effectiveProjectId]);

  const handleModalRelatedChange = useCallback(async (value: string) => {
    if (value === RELATED_NEW) {
      setModalDescriptionGenerating(false);
      setModalDescriptionAiGenerated(false);
      const nextDesc = userHasEditedDescription.current
        ? modalDraftRef.current.description
        : "";
      modalDescriptionRef.current = nextDesc;
      setModalDraft((d) => ({
        ...d,
        relatedArtifactId: RELATED_NEW,
        title: "",
        versionNumber: 1,
        versionCeiling: 1,
        description: nextDesc,
      }));
      setRelatedArtifactChanged(true);
      return;
    }
    const supabase = createSupabaseBrowserClient();
    const { data: art } = await supabase
      .from("artifacts")
      .select("name, description")
      .eq("id", value)
      .maybeSingle();
    const { data: rows } = await supabase
      .from("artifact_versions")
      .select("version_number, description")
      .eq("artifact_id", value)
      .order("version_number", { ascending: false })
      .limit(1);
    const top =
      Array.isArray(rows) && rows.length > 0
        ? (rows[0] as { version_number?: number; description?: string | null })
        : null;
    const maxVer =
      typeof top?.version_number === "number" ? top.version_number : 0;
    const nextVer = maxVer + 1;
    const lastDesc =
      top?.description != null && String(top.description).trim() !== ""
        ? String(top.description).trim()
        : String((art as { description?: string | null })?.description ?? "").trim();

    const descToApply = userHasEditedDescription.current
      ? modalDraftRef.current.description
      : lastDesc;

    const titleToApply = artifactNameUserEdited.current
      ? modalDraftRef.current.title
      : String((art as { name?: string })?.name ?? "");

    modalDescriptionRef.current = descToApply;

    const nextDraft = {
      ...modalDraftRef.current,
      relatedArtifactId: value,
      title: titleToApply,
      versionNumber: nextVer,
      versionCeiling: nextVer,
      description: descToApply,
    };
    modalDraftRef.current = nextDraft;

    setModalDescriptionGenerating(false);
    setModalDescriptionAiGenerated(false);
    setModalDraft(nextDraft);
    setRelatedArtifactChanged(true);
  }, []);

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
      if (!a.iterationLabel.trim() || a.versionNumber < 1) return false;
      if (a.kind === "file") return Boolean(a.file);
      return isValidHttpUrl(a.linkUrl);
    });

  const step1NextActive = artifactsValid;

  const step2NextActive = step2SubmitEnabled(reviewType, reviewers);

  const step3CreateActive = reviewFocus.trim().length > 0;

  const hasArtifactDescriptions = artifacts.some(
    (a) => a.description.trim().length > 0,
  );
  const focusButtonDisabled =
    reviewFocusGenerating ||
    (!hasArtifactDescriptions && reviewFocus.trim().length === 0);
  const focusButtonTooltip =
    !hasArtifactDescriptions && reviewFocus.trim().length === 0
      ? "Add artifact descriptions to generate a review focus."
      : undefined;
  const focusButtonOptimiseTooltip =
    reviewFocus.trim().length > 0 &&
    !reviewFocusGenerating &&
    !(reviewFocusAiGenerated && reviewFocus.trim().length > 0)
      ? "Fixes grammar and spelling. Your content and meaning are preserved."
      : undefined;
  const focusAiButtonTooltip = focusButtonTooltip ?? focusButtonOptimiseTooltip;

  const step1TooltipLabel = useMemo(() => {
    if (artifacts.length === 0) return "Add at least one artifact to continue";
    if (!artifactsValid) {
      return "Complete each artifact name, version, and file or valid link";
    }
    return "Complete required fields to proceed";
  }, [artifacts.length, artifactsValid]);

  const step2TooltipLabel = useMemo(() => {
    if (reviewers.length === 0) return "Add at least one reviewer to continue";
    return "Complete required fields to proceed";
  }, [reviewers.length]);

  const step3TooltipLabel = useMemo(() => {
    if (!reviewFocus.trim()) return "Add a review focus to continue";
    return "Complete required fields to proceed";
  }, [reviewFocus]);

  const modalDescTrim = modalDraft.description.trim();

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

  const reviewerExclude = new Set(reviewers.map((r) => r.id));

  const versionModalOk =
    modalDraft.versionNumber >= 1 &&
    modalDraft.versionNumber <= modalDraft.versionCeiling;

  const linkModalAddEnabled =
    isValidHttpUrl(modalDraft.linkUrl) &&
    modalDraft.title.trim().length > 0 &&
    versionModalOk;

  const uploadModalAddEnabled =
    modalDraft.file !== null &&
    modalDraft.title.trim().length > 0 &&
    versionModalOk;

  const relatedArtifactOptions = useMemo(
    () => [
      { value: RELATED_NEW, label: "New artifact" },
      ...projectArtifacts.map((a) => ({ value: a.id, label: a.name })),
    ],
    [projectArtifacts]
  );

  const modalVersionSelectOptions = useMemo(
    () =>
      Array.from({ length: modalDraft.versionCeiling }, (_, i) => {
        const n = i + 1;
        return { value: String(n), label: `v${n}` };
      }),
    [modalDraft.versionCeiling]
  );

  const selectedProjectName =
    projectMenuOptions.find((p) => p.id === selectedRelatedProjectId)?.name ?? "";

  /** Modal description AI — only from the description field wand / labelled button. */
  async function runModalDescriptionGeneration() {
    const d = modalDraftRef.current;
    const trimmed = d.description.trim();
    if (!trimmed) return;
    setModalDescriptionGenerating(true);
    try {
      const result = await generateArtifactDescription({
        existingContent: trimmed,
      });
      if (!result.ok) return;
      const next = { ...modalDraftRef.current, description: result.description };
      modalDraftRef.current = next;
      modalDescriptionRef.current = result.description;
      setModalDraft(next);
      setModalDescriptionAiGenerated(true);
      setRelatedArtifactChanged(false);
      userHasEditedDescription.current = true;
    } finally {
      setModalDescriptionGenerating(false);
    }
  }

  // Map ReviewType → the API surface used by the AI server actions.
  function reviewTypeForAi(rt: ReviewType): "Approval" | "Comparison" {
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
    const priorReviewsExist = projectArtifacts.length > 0;
    setReviewTitleGenerating(true);
    const result = await generateReviewTitle({
      artifactNames: names,
      reviewType: reviewTypeForAi(reviewTypeRef.current),
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
  async function runReviewFocusGeneration(currentArtifacts: ArtifactDraft[]) {
    const existing = reviewFocusRef.current.trim();
    const descriptions = currentArtifacts
      .map((a) => a.description.trim())
      .filter(Boolean);
    if (!existing && descriptions.length === 0) return;
    const selectedProblems = relatedProblems
      .map((id) => availableProblems.find((p) => p.id === id)?.description ?? "")
      .map((d) => d.trim())
      .filter(Boolean);
    const selectedTradeoffs = aiTradeoffs
      .map((t) => t.description.trim())
      .filter(Boolean);
    setReviewFocusGenerating(true);
    const result = await generateReviewFocus({
      artifactDescriptions: descriptions,
      reviewType: reviewTypeForAi(reviewTypeRef.current),
      projectName: selectedProjectName.trim() || undefined,
      selectedProblems: selectedProblems.length > 0 ? selectedProblems : undefined,
      selectedTradeoffs: selectedTradeoffs.length > 0 ? selectedTradeoffs : undefined,
      existingContent: existing || undefined,
    });
    setReviewFocusGenerating(false);
    if (!result.ok) return;
    setReviewFocus(result.focus);
    setReviewFocusAiGenerated(true);
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

  function handleAddLinkUrlBlur() {
    const urlToFetch = modalDraftRef.current.linkUrl.trim();
    if (!isFigmaUrl(urlToFetch)) {
      setModalOembedRaw(null);
      return;
    }
    const oEmbedUrl = `https://www.figma.com/api/oembed?url=${encodeURIComponent(urlToFetch)}`;
    void fetch(oEmbedUrl)
      .then((r) => r.json())
      .then((data: { title?: string }) => {
        const raw = data?.title?.trim();
        if (!raw) {
          setModalOembedRaw(null);
          return;
        }
        setModalOembedRaw(raw);
        const frameName = parseFigmaFrameNameFromOembedTitle(raw);
        if (!frameName) return;
        const currentTitle = modalDraftRef.current.title.trim();
        const isDefaultTitle =
          /^Concept \d+$/.test(currentTitle) || currentTitle === "";
        if (isDefaultTitle) {
          setModalDraft((d) => ({ ...d, title: frameName }));
        }
      })
      .catch(() => {
        setModalOembedRaw(null);
      });
  }

  function handleAddLinkArtifact() {
    if (artifacts.length >= 10) return;
    if (!linkModalAddEnabled) return;
    const localKey = crypto.randomUUID();
    const linkUrl = modalDraft.linkUrl.trim();
    const v = modalDraft.versionNumber;
    const descriptionTrim = modalDraft.description.trim();
    const baseTitle = modalDraft.title.trim();
    const existingTitles = new Set(artifacts.map((a) => a.title.trim()));
    let finalTitle = baseTitle;
    let counter = 2;
    while (existingTitles.has(finalTitle)) {
      finalTitle = `${baseTitle} ${counter}`;
      counter++;
    }
    const newArtifact: ArtifactDraft = {
      localKey,
      kind: "link",
      file: null,
      linkUrl,
      title: finalTitle,
      iterationLabel: `v${v}`,
      description: descriptionTrim,
      descriptionAiState: modalDescriptionAiGenerated ? "ai_generated" : "idle",
      aiGenerated: modalDescriptionAiGenerated,
      versionNumber: v,
      resolvedArtifactId:
        modalDraft.relatedArtifactId &&
        modalDraft.relatedArtifactId !== RELATED_NEW
          ? modalDraft.relatedArtifactId
          : null,
    };
    setArtifacts((prev) => [...prev, newArtifact]);
    if (isFigmaUrl(linkUrl) && modalOembedRaw) {
      setFigmaMetaMap((prev) => ({
        ...prev,
        [localKey]: {
          fileName: modalOembedRaw,
          lastEdited: "Just added",
        },
      }));
    }
    setAddLinkModalOpen(false);
    abortModalGeneration();
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
        behavior: "smooth"
      });
    }, 50);
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

  function handleAddUploadArtifact() {
    if (artifacts.length >= 10) return;
    if (!uploadModalAddEnabled || !modalDraft.file) return;
    const localKey = crypto.randomUUID();
    const file = modalDraft.file;
    const v = modalDraft.versionNumber;
    const baseTitle = modalDraft.title.trim();
    const existingTitles = new Set(artifacts.map((a) => a.title.trim()));
    let titleTrim = baseTitle;
    let counter = 2;
    while (existingTitles.has(titleTrim)) {
      titleTrim = `${baseTitle} ${counter}`;
      counter++;
    }
    const descriptionTrim = modalDraft.description.trim();
    setArtifacts((prev) => [
      ...prev,
      {
        localKey,
        kind: "file",
        file,
        linkUrl: "",
        title: titleTrim,
        iterationLabel: `v${v}`,
        description: descriptionTrim,
        descriptionAiState: modalDescriptionAiGenerated ? "ai_generated" : "idle",
        aiGenerated: modalDescriptionAiGenerated,
        versionNumber: v,
        resolvedArtifactId:
          modalDraft.relatedArtifactId &&
          modalDraft.relatedArtifactId !== RELATED_NEW
            ? modalDraft.relatedArtifactId
            : null,
      },
    ]);
    if (
      file &&
      ["image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"].includes(
        file.type
      )
    ) {
      const url = URL.createObjectURL(file);
      setArtifactPreviews((prev) => ({ ...prev, [localKey]: url }));
    } else if (file.type === "application/pdf") {
      const url = URL.createObjectURL(file);
      setArtifactPreviews((prev) => ({ ...prev, [localKey]: url }));
    }
    setUploadModalOpen(false);
    abortModalGeneration();
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
        behavior: "smooth"
      });
    }, 50);
  }

  async function handleCreateReview() {
    if (!step3CreateActive || submitting) {
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
    }));

    const input: SubmitReviewInput = {
      reviewId: crypto.randomUUID(),
      projectId,
      title: reviewTitle.trim(),
      reviewType,
      sendNotification: sendNotification,
      reviewFocus: reviewFocus.trim() || null,
      relatedProblemIds: relatedProblems,
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

  const linkModalUrlFieldId = `${uid}-modal-link-url`;
  const linkModalRelatedFieldId = `${uid}-modal-link-related`;
  const linkModalNameFieldId = `${uid}-modal-link-name`;
  const uploadModalRelatedFieldId = `${uid}-modal-upload-related`;
  const uploadModalNameFieldId = `${uid}-modal-upload-name`;

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
      <input
        ref={uploadFileInputRef}
        type="file"
        accept={ACCEPTED_MIME_TYPES}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) {
            if (!ACCEPTED_MIME_TYPES.split(",").includes(file.type)) {
              setArtifactToast(
                "Unsupported file type. Use JPEG, PNG, GIF, WEBP, SVG or PDF."
              );
              setTimeout(() => setArtifactToast(null), 4000);
              e.target.value = "";
              return;
            }
            setModalDraft((d) => ({
              ...d,
              file,
              title: d.title || file.name.replace(/\.[^/.]+$/, "") || file.name
            }));
          }
          e.target.value = "";
        }}
      />
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
                  Artifacts*
                </p>
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
                      const conceptTitle = `Concept ${artifacts.length + 1}`;
                      const next = {
                        ...getEmptyModalDraftState(conceptTitle),
                        description: modalDescriptionRef.current,
                      };
                      setModalDraft(next);
                      modalDraftRef.current = next;
                      setModalDescriptionGenerating(false);
                      setModalDescriptionAiGenerated(false);
                      setRelatedArtifactChanged(false);
                      artifactNameUserEdited.current = false;
                      userHasEditedDescription.current = false;
                      lastAutoFilledArtifactTitleRef.current = "";
                      lastAutoFilledArtifactTitleRef.current = conceptTitle;
                      setModalOembedRaw(null);
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
                      const conceptTitle = `Concept ${artifacts.length + 1}`;
                      const next = {
                        ...getEmptyModalDraftState(conceptTitle),
                        description: modalDescriptionRef.current,
                      };
                      setModalDraft(next);
                      modalDraftRef.current = next;
                      setModalDescriptionGenerating(false);
                      setModalDescriptionAiGenerated(false);
                      setRelatedArtifactChanged(false);
                      artifactNameUserEdited.current = false;
                      userHasEditedDescription.current = false;
                      lastAutoFilledArtifactTitleRef.current = "";
                      lastAutoFilledArtifactTitleRef.current = conceptTitle;
                      setModalOembedRaw(null);
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
                        iteration={a.iterationLabel}
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
                              const m = /^v(\d+)$/i.exec(String(iteration).trim());
                              const n = m ? parseInt(m[1], 10) : x.versionNumber;
                              return {
                                ...x,
                                iterationLabel: iteration,
                                versionNumber: Number.isFinite(n) ? n : x.versionNumber,
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
                    label="Related project"
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
                  options={REVIEW_TYPE_OPTIONS.map((o) => ({
                    value: o.value,
                    label: o.label
                  }))}
                  value={reviewType}
                  onChange={(v) => {
                    reviewTypeIsAiSuggested.current = false;
                    setReviewType(v as ReviewType);
                  }}
                  placeholder="Select type"
                  size="sm"
                />
                {reviewType === "compare" && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      fontWeight: 400,
                      lineHeight: 1.45,
                      letterSpacing: "0.24px",
                      color: TOKENS.secondary
                    }}
                  >
                    Reviewers will select a preferred option. A decision will be
                    recorded when feedback is complete.
                  </p>
                )}
                {reviewType === "approve" && (
                  <p
                    style={{
                      margin: 0,
                      fontSize: 12,
                      fontWeight: 400,
                      lineHeight: 1.45,
                      letterSpacing: "0.24px",
                      color: TOKENS.secondary
                    }}
                  >
                    Reviewers can approve or request changes on individual artifacts.
                    A decision will be recorded when all feedback is in.
                  </p>
                )}
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
                      reviewType === "compare" || reviewType === "approve"
                        ? "The first reviewer selected is the final decision maker. Reviewers will select a preferred concept and provide feedback."
                        : undefined
                    }
                    showHelper={
                      (reviewType === "compare" || reviewType === "approve") &&
                      !reviewersFieldError
                    }
                  />
                  <Menu
                    id={reviewersListboxId}
                    open={reviewerMenuOpen && filteredTeammates.length > 0}
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
                    {filteredTeammates.map((u) => (
                      <MenuItem
                        key={u.id}
                        label={u.name}
                        avatarSrc={u.avatarUrl ?? undefined}
                        avatarName={u.name}
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
                  </Menu>
                </div>
                {reviewers.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                    {reviewers.map((user, idx) => {
                      const isDecisionMaker =
                        idx === 0 && requireDecisionMakerForDb(reviewType);
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
                                  : "#c9a0a8"
                                : isDecisionMaker
                                  ? "#d9a8dc"
                                  : "#e4ddd3"
                            }`,
                            backgroundColor:
                              hoveredChipId === user.id
                                ? isDecisionMaker
                                  ? "#e8cde8"
                                  : "#e8d0d4"
                                : isDecisionMaker
                                  ? "#f5e8f6"
                                  : "#f3efe9",
                            flexShrink: 0,
                            transition:
                              "background-color 120ms ease, border-color 120ms ease"
                          }}
                        >
                          <span
                            style={{
                              width: 24,
                              height: 24,
                              borderRadius: 999,
                              backgroundColor: "#ede8e0",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: 11,
                              fontWeight: 600,
                              color: "#2e1c1c",
                              flexShrink: 0
                            }}
                          >
                            {user.name.trim().charAt(0).toUpperCase()}
                          </span>
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
                  onChange={setSendNotification}
                />
              </div>
            </div>
          ) : (
            <div className="flex min-w-0 w-full flex-col" style={{ gap: 24 }}>
              <div className="flex flex-col" style={{ gap: 6 }}>
                <div className="relative w-full" ref={problemsSelectRef}>
                  <SelectField
                    label="Related problems"
                    type="single"
                    size="sm"
                    placeholder="Select relevant project problems"
                    selectedLabel={
                      relatedProblems.length > 0
                        ? `${relatedProblems.length} problem${relatedProblems.length > 1 ? "s" : ""} selected`
                        : undefined
                    }
                    isOpen={problemsSelectOpen}
                    onOpen={() => setProblemsSelectOpen((prev) => !prev)}
                    fieldId={problemsFieldId}
                  />
                  <Menu
                    open={problemsSelectOpen}
                    onClose={() => setProblemsSelectOpen(false)}
                    type="multi-select"
                    anchorRef={problemsSelectRef}
                    align="left"
                    aria-label="Problem options"
                    footerAction={
                      availableProblems.length > 0
                        ? {
                            type: "button",
                            label: "Done",
                            onClick: () => setProblemsSelectOpen(false),
                            additionalLinkLabel: "Create a new problem",
                            showAdditionalLink: true,
                            onAdditionalLink: () => {
                              setProblemsSelectOpen(false);
                              setCreateProblemModalOpen(true);
                            }
                          }
                        : undefined
                    }
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
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 4,
                      marginTop: 4
                    }}
                  >
                    {relatedProblems.map((id) => {
                      const problem = availableProblems.find((p) => p.id === id);
                      if (!problem) return null;
                      const text = problem.description ?? id;
                      return (
                        <div
                          key={id}
                          style={{
                            display: "flex",
                            flexDirection: "row",
                            alignItems: "flex-start",
                            gap: 8,
                            minHeight: 32,
                            height: "auto",
                            paddingTop: 6,
                            paddingBottom: 6,
                            paddingLeft: 8,
                            paddingRight: 8,
                            borderRadius: 4,
                            border: "1px solid #e4ddd3",
                            backgroundColor: "#f3efe9"
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Step3ClampText
                              text={text}
                              textStyle={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: "#2e1c1c",
                                letterSpacing: "0.13px",
                                lineHeight: 1.5,
                              }}
                            />
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setRelatedProblems((prev) => prev.filter((x) => x !== id))
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
                              flexShrink: 0,
                              alignSelf: "flex-start",
                            }}
                            aria-label="Remove problem"
                          >
                            <Icon name="close" size={14} />
                          </button>
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
                      gap: 4,
                      marginTop: 4,
                    }}
                  >
                    {aiTradeoffs.map((t, idx) => {
                      const sentiment = tradeoffSentimentStyle(t.severity);
                      const text = t.description || "(empty tradeoff)";
                      return (
                        <div
                          key={idx}
                          style={{
                            display: "flex",
                            flexDirection: "row",
                            alignItems: "flex-start",
                            gap: 8,
                            minHeight: 32,
                            height: "auto",
                            paddingTop: 6,
                            paddingBottom: 6,
                            paddingLeft: 12,
                            paddingRight: 12,
                            borderRadius: 4,
                            border: `1px solid ${sentiment.border}`,
                            backgroundColor: sentiment.bg,
                          }}
                        >
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Step3ClampText
                              text={text}
                              textStyle={{
                                fontSize: 13,
                                fontWeight: 500,
                                color: "#2e1c1c",
                                letterSpacing: "0.13px",
                                lineHeight: 1.5,
                              }}
                            />
                            <div
                              style={{
                                display: "flex",
                                flexDirection: "row",
                                gap: 6,
                                marginTop: 4,
                                alignItems: "center",
                                flexWrap: "wrap",
                              }}
                            >
                              {t.severity ? (
                                <span
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    justifyContent: "center",
                                    height: 20,
                                    padding: "0 8px",
                                    borderRadius: 9999,
                                    backgroundColor: sentiment.pillBg,
                                    color: sentiment.pillFg,
                                    fontSize: 11,
                                    fontWeight: 600,
                                    lineHeight: 1.5,
                                    letterSpacing: "0.22px",
                                    flexShrink: 0,
                                  }}
                                >
                                  {t.severity}
                                </span>
                              ) : null}
                              {t.artifactLabel ? (
                                <Tag
                                  label={t.artifactLabel}
                                  variant="neutral"
                                  size="sm"
                                />
                              ) : null}
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              setAiTradeoffs((prev) =>
                                prev.filter((_, i) => i !== idx)
                              )
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
                              flexShrink: 0,
                              alignSelf: "flex-start",
                            }}
                            aria-label="Remove tradeoff"
                          >
                            <Icon name="close" size={14} />
                          </button>
                        </div>
                      );
                    })}
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
                  size="md"
                  variant="form-fixed"
                  placeholder={
                    reviewFocusGenerating
                      ? "Generating review focus…"
                      : "What initial focus or questions do you have for the reviewers?"
                  }
                  value={reviewFocus}
                  onChange={(e) => {
                    if (reviewFocusAiGenerated) {
                      setReviewFocusAiGenerated(false);
                    }
                    setReviewFocus(e.target.value);
                  }}
                  showLoadingButton={reviewFocusGenerating}
                  showAiButton={
                    !reviewFocusGenerating &&
                    !(
                      reviewFocusAiGenerated && reviewFocus.trim().length > 0
                    )
                  }
                  aiButtonLabel={
                    reviewFocus.trim().length === 0
                      ? "Generate with Ai"
                      : "Optimise with Ai"
                  }
                  aiButtonTooltip={focusAiButtonTooltip}
                  aiButtonDisabled={focusButtonDisabled}
                  onAiButtonClick={() => {
                    void runReviewFocusGeneration(artifacts);
                  }}
                />
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

              if (includeTeammateInProject && email && activeWorkspaceId) {
                const inviteResult = await sendWorkspaceInvite({
                  workspace_id: activeWorkspaceId,
                  email,
                  name,
                  role: "viewer",
                });
                if (inviteResult.status === "error") {
                  setIsCreatingTeammate(false);
                  showToast(inviteToastMessage(inviteResult, name, email));
                  return;
                }
                showToast(inviteToastMessage(inviteResult, name, email));
              }

              const { data, error } = await supabase
                .from("contributors")
                .insert({
                  project_id:
                    includeTeammateInProject && effectiveProjectId.trim()
                      ? effectiveProjectId.trim()
                      : null,
                  workspace_id: includeTeammateInProject ? activeWorkspaceId : null,
                  name,
                  email: email || null,
                  role: newTeammateRole.trim() || "Stakeholder",
                })
                .select("id, name, email, role")
                .single();
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

    <Modal
      open={addLinkModalOpen}
      type="form"
      size="lg"
      title="Add Link"
      bodyRef={addLinkModalBodyRef}
      dialogStyle={{ width: 800, maxWidth: "calc(100vw - 48px)" }}
      footerNoPadding
      onClose={() => {
        abortModalGeneration();
        setAddLinkModalOpen(false);
      }}
      footer={
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            width: "100%",
            minWidth: 0,
            alignSelf: "stretch",
            borderTop: "1px solid var(--border-subtle, #ede8e0)",
            boxShadow: addLinkBodyScrolled
              ? "0 -2px 8px rgba(41, 33, 28, 0.08)"
              : "none",
            padding: "16px 24px",
            boxSizing: "border-box",
          }}
        >
          <Button
            variant="secondary"
            size="sm"
            label="Cancel"
            onClick={() => {
              abortModalGeneration();
              setAddLinkModalOpen(false);
            }}
          />
          {linkModalAddEnabled ? (
            <Button
              variant="primary"
              size="sm"
              label="Add Artifact"
              disabled={modalDescriptionGenerating}
              onClick={handleAddLinkArtifact}
            />
          ) : (
            <Tooltip
              label={
                modalDescriptionGenerating
                  ? "Optimising description…"
                  : !isValidHttpUrl(modalDraft.linkUrl.trim())
                    ? "Enter a valid URL"
                    : !modalDraft.title.trim()
                      ? "Enter an artifact name"
                      : !versionModalOk
                        ? "Select a valid version for this artifact"
                        : "Complete all required fields"
              }
              position="top"
            >
              <Button
                variant="primary"
                size="sm"
                label="Add Artifact"
                disabled
                onClick={() => {}}
              />
            </Tooltip>
          )}
        </div>
      }
    >
      <div
        style={{
          display: "flex",
          flexDirection: "row",
          width: "calc(100% + 48px)",
          marginLeft: -24,
          marginRight: -24,
          marginTop: -20,
          marginBottom: -20,
          flex: "1 1 auto",
          minHeight: 400,
          alignSelf: "stretch",
          minWidth: 0,
        }}
      >
        {/* Preview column */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            width: "50%",
            alignSelf: "stretch",
            borderRight: "1px solid var(--border-subtle, #ede8e0)",
            minWidth: 0,
          }}
        >
          <div
            style={{
              flex: 1,
              position: "relative",
              background: "#c9c0b4",
              overflow: "hidden",
              minHeight: 0,
            }}
          >
            {isFigmaUrl(modalDraft.linkUrl) ? (
              <iframe
                src={buildFigmaEmbedUrl(modalDraft.linkUrl)}
                width="100%"
                height="100%"
                style={{ border: "none", display: "block" }}
                allowFullScreen
                title="Figma preview"
              />
            ) : (
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Icon
                  name="artifact"
                  size={64}
                  style={{
                    opacity: 0.35,
                    color: "var(--text-tertiary)",
                  }}
                />
              </div>
            )}
            {isFigmaUrl(modalDraft.linkUrl) ? (
              <div style={{ position: "absolute", top: 10, left: 10 }}>
                <Tag label="Figma" variant="neutral" size="sm" />
              </div>
            ) : null}
            {isFigmaUrl(modalDraft.linkUrl) ? (
              <div style={{ position: "absolute", top: 10, right: 10 }}>
                <IconSquareButton
                  icon="trash"
                  label="Clear link"
                  onClick={() => {
                    setModalDraft((d) => ({ ...d, linkUrl: "" }));
                    setModalOembedRaw(null);
                    setModalDescriptionAiGenerated(false);
                  }}
                />
              </div>
            ) : null}
            {isFigmaUrl(modalDraft.linkUrl) ? (
              <div
                style={{
                  position: "absolute",
                  bottom: 10,
                  right: 10,
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <IconSquareButton
                  icon="plus"
                  label="Zoom in"
                  onClick={() => {}}
                />
                <IconSquareButton
                  icon="minus"
                  label="Zoom out"
                  onClick={() => {}}
                />
              </div>
            ) : null}
          </div>
        </div>

        {/* Form column */}
        <div
          style={{
            width: "50%",
            overflowY: "auto",
            padding: "20px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 12,
            minWidth: 0,
          }}
        >
          <Input
            fieldId={linkModalUrlFieldId}
            label="Link URL"
            required
            size="sm"
            placeholder="http://"
            value={modalDraft.linkUrl}
            onChange={(e) => setModalDraft((d) => ({ ...d, linkUrl: e.target.value }))}
            onBlur={() => handleAddLinkUrlBlur()}
            error={modalDraft.linkUrl.length > 0 && !isValidHttpUrl(modalDraft.linkUrl)}
            errorMessage="Please enter a valid URL"
          />
          {projectArtifacts.length > 0 ? (
            <Select
              id={linkModalRelatedFieldId}
              label="Related Artifact"
              options={relatedArtifactOptions}
              value={modalDraft.relatedArtifactId || undefined}
              placeholder="Select or create new"
              onChange={(v) => {
                void handleModalRelatedChange(v);
              }}
              size="sm"
            />
          ) : null}
          <div className="flex w-full min-w-0 gap-2" style={{ alignItems: "flex-start" }}>
            <div className="min-w-0 flex-1">
              <Input
                fieldId={linkModalNameFieldId}
                label="Artifact Name"
                required
                size="sm"
                placeholder="e.g. Concept 1"
                value={modalDraft.title}
                onChange={(e) => {
                  if (modalNameFieldMountedRef.current) {
                    artifactNameUserEdited.current = true;
                  }
                  setModalDraft((d) => ({ ...d, title: e.target.value }));
                }}
              />
            </div>
            <div style={{ width: 120, flexShrink: 0 }}>
              <Select
                label="Version"
                options={modalVersionSelectOptions}
                value={String(modalDraft.versionNumber)}
                onChange={(opt) =>
                  setModalDraft((d) => ({
                    ...d,
                    versionNumber: parseInt(opt, 10) || 1,
                  }))
                }
                placeholder="v1"
                size="sm"
              />
            </div>
          </div>
          <div className="flex flex-col" style={{ gap: 0 }}>
            <TextareaAi
              label="Description"
              size="md"
              variant="form-fixed"
              generating={modalDescriptionGenerating}
              hideIdleAiFooter
              placeholder={
                modalDescriptionGenerating
                  ? "Optimising description…"
                  : "Describe what this design shows"
              }
              value={modalDraft.description}
              onChange={(e) => {
                userHasEditedDescription.current = true;
                setRelatedArtifactChanged(false);
                setModalDescriptionAiGenerated(false);
                modalDescriptionRef.current = e.target.value;
                setModalDraft((d) => ({ ...d, description: e.target.value }));
              }}
              showLoadingButton={modalDescriptionGenerating}
              showAiButton={false}
            />
            <div
              style={{
                display: "flex",
                flexDirection: "row",
                alignItems: "flex-start",
                gap: 6,
                width: "100%",
                marginTop: 6,
              }}
            >
              {relatedArtifactChanged && modalDraft.description.trim().length > 0 ? (
                <p
                  style={{
                    flex: 1,
                    minWidth: 0,
                    fontSize: 12,
                    color: "var(--text-secondary)",
                    lineHeight: 1.5,
                    margin: 0,
                  }}
                >
                  Description carried over from previous version — edit or optimise as needed.
                </p>
              ) : (
                <span style={{ flex: 1, minWidth: 0 }} aria-hidden />
              )}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                label="Optimise with Ai"
                icon="leading"
                iconName="ai-stars"
                style={{ flexShrink: 0 }}
                disabled={modalDescriptionGenerating || !modalDraft.description.trim()}
                onClick={() => {
                  void runModalDescriptionGeneration();
                }}
              />
            </div>
          </div>
        </div>
      </div>
    </Modal>

    <Modal
      open={uploadModalOpen}
      type="form"
      size="md"
      title="Upload Artifact"
      onClose={() => {
        abortModalGeneration();
        setUploadModalOpen(false);
      }}
      footer={
        <div
          style={{
            display: "flex",
            justifyContent: "flex-end",
            gap: 8,
            width: "100%",
          }}
        >
          <Button
            variant="secondary"
            size="sm"
            label="Cancel"
            onClick={() => {
              abortModalGeneration();
              setUploadModalOpen(false);
            }}
          />
          {uploadModalAddEnabled ? (
            <Button
              variant="primary"
              size="sm"
              label="Add Artifact"
              disabled={modalDescriptionGenerating}
              onClick={handleAddUploadArtifact}
            />
          ) : (
            <Tooltip
              label={
                modalDescriptionGenerating
                  ? "Optimising description…"
                  : !modalDraft.file
                    ? "Select a file"
                    : !modalDraft.title.trim()
                      ? "Enter an artifact name"
                      : !versionModalOk
                        ? "Select a valid version for this artifact"
                        : "Complete all required fields"
              }
              position="top"
            >
              <Button
                variant="primary"
                size="sm"
                label="Add Artifact"
                disabled
                onClick={() => {}}
              />
            </Tooltip>
          )}
        </div>
      }
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 8
        }}
      >
        <div
          style={{
            backgroundColor: "#f3efe9",
            border: "2px dashed #c9c0b4",
            borderRadius: 8,
            height: 150,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 10
          }}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const file = e.dataTransfer.files?.[0];
            if (file) {
              if (!ACCEPTED_MIME_TYPES.split(",").includes(file.type)) {
                setArtifactToast(
                  "Unsupported file type. Use JPEG, PNG, GIF, WEBP, SVG or PDF."
                );
                setTimeout(() => setArtifactToast(null), 4000);
                return;
              }
              setModalDraft((d) => ({
                ...d,
                file,
                title: d.title || file.name.replace(/\.[^/.]+$/, "") || file.name,
              }));
            }
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <Icon name="upload" size={20} style={{ color: "#6b5e55" }} />
            <span style={{ fontSize: 14, fontWeight: 500, color: "#6b5e55" }}>
              Drag & drop files here
            </span>
          </div>
          <span style={{ fontSize: 14, fontWeight: 500, color: "#6b5e55" }}>OR</span>
          <Button
            variant="secondary"
            size="sm"
            label="Browse files"
            onClick={() => uploadFileInputRef.current?.click()}
          />
        </div>
        <p
          style={{
            fontFamily: "'Plus Jakarta Sans', sans-serif",
            fontSize: 12,
            fontWeight: 400,
            lineHeight: 1.5,
            letterSpacing: "0.24px",
            color: "#6b5e55",
            margin: 0
          }}
        >
          You can upload files in the following formats: JPEG, PNG, GIF, WEBP, SVG, and PDF.
        </p>
      </div>

      {modalDraft.file && (
        <p style={{ fontSize: 12, color: "#6b5e55", margin: 0 }}>
          {modalDraft.file.name} · {formatFileSize(modalDraft.file.size)}
        </p>
      )}

      {projectArtifacts.length > 0 ? (
        <Select
          id={uploadModalRelatedFieldId}
          label="Related Artifact"
          options={relatedArtifactOptions}
          value={modalDraft.relatedArtifactId || undefined}
          placeholder="Select or create new"
          onChange={(v) => {
            void handleModalRelatedChange(v);
          }}
          size="sm"
        />
      ) : null}

      <div className="flex w-full min-w-0 gap-2" style={{ alignItems: "flex-start" }}>
        <div className="min-w-0 flex-1">
          <Input
            fieldId={uploadModalNameFieldId}
            label="Artifact Name"
            required
            size="sm"
            placeholder="e.g. Concept 1"
            value={modalDraft.title}
            onChange={(e) => {
              if (uploadModalNameFieldMountedRef.current) {
                artifactNameUserEdited.current = true;
              }
              setModalDraft((d) => ({ ...d, title: e.target.value }));
            }}
          />
        </div>
        <div style={{ width: 120, flexShrink: 0 }}>
          <Select
            label="Version"
            options={modalVersionSelectOptions}
            value={String(modalDraft.versionNumber)}
            onChange={(opt) =>
              setModalDraft((d) => ({
                ...d,
                versionNumber: parseInt(opt, 10) || 1,
              }))
            }
            placeholder="v1"
            size="sm"
          />
        </div>
      </div>

      <div className="flex flex-col" style={{ gap: 0 }}>
        <TextareaAi
          label="Description"
          size="md"
          variant="form-fixed"
          generating={modalDescriptionGenerating}
          hideIdleAiFooter
          placeholder={
            modalDescriptionGenerating
              ? "Optimising description…"
              : "Describe what this design shows"
          }
          value={modalDraft.description}
          onChange={(e) => {
            userHasEditedDescription.current = true;
            setRelatedArtifactChanged(false);
            setModalDescriptionAiGenerated(false);
            modalDescriptionRef.current = e.target.value;
            setModalDraft((d) => ({ ...d, description: e.target.value }));
          }}
          showLoadingButton={modalDescriptionGenerating}
          showAiButton={false}
        />
        <div
          style={{
            display: "flex",
            flexDirection: "row",
            alignItems: "flex-start",
            gap: 6,
            width: "100%",
            marginTop: 6,
          }}
        >
          {relatedArtifactChanged && modalDraft.description.trim().length > 0 ? (
            <p
              style={{
                flex: 1,
                minWidth: 0,
                fontSize: 12,
                color: "var(--text-secondary)",
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              Description carried over from previous version — edit or optimise as needed.
            </p>
          ) : (
            <span style={{ flex: 1, minWidth: 0 }} aria-hidden />
          )}
          <Button
            type="button"
            variant="secondary"
            size="sm"
            label="Optimise with Ai"
            icon="leading"
            iconName="ai-stars"
            style={{ flexShrink: 0 }}
            disabled={modalDescriptionGenerating || !modalDraft.description.trim()}
            onClick={() => {
              void runModalDescriptionGeneration();
            }}
          />
        </div>
      </div>
    </Modal>
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
    </>
  );
}
