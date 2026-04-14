"use client";

import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState
} from "react";
import { Button, Icon, Input } from "@/components/ui/ds";
import type {
  ArtifactDraftForSubmit,
  SubmitReviewInput
} from "@/lib/reviews/submitReviewClient";
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
};

const REVIEW_TYPE_OPTIONS: { value: ReviewType; label: string }[] = [
  { value: "compare", label: "Compare" },
  { value: "critique", label: "Critique" },
  { value: "align", label: "Align" },
  { value: "approve", label: "Approve" }
];

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

type ArtifactDraft = {
  localKey: string;
  kind: "file" | "link";
  file: File | null;
  linkUrl: string;
  title: string;
  iterationLabel: string;
  description: string;
};

function newArtifact(kind: "file" | "link", file: File | null): ArtifactDraft {
  const localKey = crypto.randomUUID();
  if (kind === "file" && file) {
    return {
      localKey,
      kind: "file",
      file,
      linkUrl: "",
      title: file.name.replace(/\.[^/.]+$/, "") || file.name,
      iterationLabel: "",
      description: ""
    };
  }
  return {
    localKey,
    kind: "link",
    file: null,
    linkUrl: "",
    title: "Link artifact",
    iterationLabel: "",
    description: ""
  };
}

function DlsLabelSmall({
  id,
  htmlFor,
  children
}: {
  id?: string;
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      id={id}
      htmlFor={htmlFor}
      className="block bg-transparent"
      style={{
        fontSize: 13,
        fontWeight: 500,
        lineHeight: 1.5,
        letterSpacing: "0.26px",
        color: TOKENS.primary,
        marginBottom: 6
      }}
    >
      {children}
    </label>
  );
}

function DlsSelectSingleSm<T extends string>({
  id,
  value,
  onChange,
  options
}: {
  id: string;
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
}) {
  const [focused, setFocused] = useState(false);
  const [hover, setHover] = useState(false);

  const borderColor = focused
    ? TOKENS.brand
    : hover
      ? "#c9c0b4"
      : TOKENS.borderDefault;

  return (
    <div
      className="relative w-full"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className="pointer-events-none flex w-full items-center border border-solid transition-[border-color,box-shadow] duration-150"
        style={{
          height: 32,
          borderRadius: TOKENS.radiusInput,
          padding: "0 12px",
          gap: 8,
          borderColor,
          backgroundColor: SURFACE,
          boxShadow: focused ? "0 0 0 3px rgba(107,30,46,0.12)" : "none",
          fontSize: 13,
          fontWeight: 400,
          color: TOKENS.primary
        }}
        aria-hidden
      >
        <span className="min-w-0 flex-1 truncate">
          {options.find((o) => o.value === value)?.label ?? value}
        </span>
        <span className="inline-flex text-[#998c82]">
          <Icon name="chevron-down" size={12} />
        </span>
      </div>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as T)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 z-[1] m-0 w-full cursor-pointer opacity-0"
        style={{ height: 32, fontSize: 13 }}
      >
        {options.map((o) => (
          <option key={String(o.value)} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

function DlsSelectRelatedProjectSm({
  id,
  value,
  onChange,
  options
}: {
  id: string;
  value: string;
  onChange: (projectId: string) => void;
  options: { id: string; name: string }[];
}) {
  const [focused, setFocused] = useState(false);
  const [hover, setHover] = useState(false);

  const borderColor = focused
    ? TOKENS.brand
    : hover
      ? "#c9c0b4"
      : TOKENS.borderDefault;

  const selectedLabel =
    options.find((p) => p.id === value)?.name ?? "Select related project";
  const displayTertiary = value === "";

  return (
    <div
      className="relative w-full"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div
        className="pointer-events-none flex w-full items-center border border-solid transition-[border-color,box-shadow] duration-150"
        style={{
          height: 32,
          borderRadius: TOKENS.radiusInput,
          padding: "0 12px",
          gap: 8,
          borderColor,
          backgroundColor: SURFACE,
          boxShadow: focused ? "0 0 0 3px rgba(107,30,46,0.12)" : "none",
          fontSize: 13,
          fontWeight: 400,
          color: displayTertiary ? TOKENS.tertiary : TOKENS.primary
        }}
        aria-hidden
      >
        <span className="min-w-0 flex-1 truncate">{selectedLabel}</span>
        <span className="inline-flex text-[#998c82]">
          <Icon name="chevron-down" size={12} />
        </span>
      </div>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="absolute inset-0 z-[1] m-0 w-full cursor-pointer opacity-0"
        style={{ height: 32, fontSize: 13 }}
      >
        <option value="" disabled>
          Select related project
        </option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function SelectedProjectSummary({ name }: { name: string }) {
  return (
    <div className="mt-3 flex flex-col" style={{ gap: 6 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 500,
          lineHeight: 1.5,
          letterSpacing: "0.24px",
          color: TOKENS.secondary
        }}
      >
        Selected project
      </span>
      <div
        className="inline-flex max-w-full items-center border border-solid"
        style={{
          alignSelf: "flex-start",
          minHeight: 32,
          padding: "6px 12px",
          borderRadius: TOKENS.radiusButtonSm,
          borderColor: TOKENS.borderSubtle,
          backgroundColor: "#faf8f6"
        }}
      >
        <span
          className="truncate text-[13px] font-medium leading-[1.5]"
          style={{ color: TOKENS.primary, letterSpacing: "0.26px" }}
        >
          {name}
        </span>
      </div>
    </div>
  );
}

function ArtifactEditorCard({
  draft,
  onChange,
  onRemove
}: {
  draft: ArtifactDraft;
  onChange: (next: ArtifactDraft) => void;
  onRemove: () => void;
}) {
  const titleId = `${draft.localKey}-title`;
  const iterId = `${draft.localKey}-iter`;
  const descId = `${draft.localKey}-desc`;
  const urlId = `${draft.localKey}-url`;

  return (
    <div
      className="border border-solid"
      style={{
        borderColor: TOKENS.borderSubtle,
        borderRadius: TOKENS.radiusInput,
        padding: 16,
        backgroundColor: SURFACE,
        display: "flex",
        flexDirection: "column",
        gap: 12
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <span
          className="text-[11px] font-semibold uppercase leading-none"
          style={{ color: TOKENS.tertiary, letterSpacing: "0.5px" }}
        >
          {draft.kind === "file" ? "File" : "Link"}
        </span>
        <button
          type="button"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded border-0 bg-transparent p-0 outline-none"
          style={{ color: TOKENS.tertiary }}
          aria-label="Remove artifact"
          onClick={onRemove}
        >
          <Icon name="close" size={14} />
        </button>
      </div>

      {draft.kind === "link" ? (
        <Input
          fieldId={urlId}
          type="url"
          label="Artifact URL"
          required
          value={draft.linkUrl}
          onChange={(e) => onChange({ ...draft, linkUrl: e.target.value })}
          placeholder="https://…"
          size="sm"
          error={
            draft.linkUrl.length > 0 && !isValidHttpUrl(draft.linkUrl)
          }
          errorMessage="Enter a valid URL"
        />
      ) : (
        <p
          className="m-0 truncate text-[12px] leading-[1.5]"
          style={{ color: TOKENS.secondary, letterSpacing: "0.24px" }}
        >
          {draft.file ? `${draft.file.name} · ${formatFileSize(draft.file.size)}` : ""}
        </p>
      )}

      <Input
        fieldId={titleId}
        type="text"
        label="Artifact title"
        required
        value={draft.title}
        onChange={(e) => onChange({ ...draft, title: e.target.value })}
        placeholder="e.g. Navigation prototype"
        size="sm"
      />

      <Input
        fieldId={iterId}
        type="text"
        label="Iteration"
        value={draft.iterationLabel}
        onChange={(e) => onChange({ ...draft, iterationLabel: e.target.value })}
        placeholder="e.g. Exploration v3"
        size="sm"
      />

      <div>
        <DlsLabelSmall htmlFor={descId}>Description (optional)</DlsLabelSmall>
        <textarea
          id={descId}
          value={draft.description}
          onChange={(e) => onChange({ ...draft, description: e.target.value })}
          rows={3}
          className="box-border w-full resize-y border border-solid outline-none"
          style={{
            borderRadius: TOKENS.radiusInput,
            padding: "8px 12px",
            fontSize: 13,
            lineHeight: 1.5,
            letterSpacing: "0.26px",
            color: TOKENS.primary,
            borderColor: TOKENS.borderDefault,
            backgroundColor: SURFACE,
            minHeight: 72
          }}
          placeholder="Add context for reviewers…"
        />
      </div>
    </div>
  );
}

function StakeholderChip({
  user,
  onRemove
}: {
  user: User;
  onRemove: () => void;
}) {
  const initial = user.name.trim().charAt(0).toUpperCase() || "?";
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
      <span
        className="flex shrink-0 items-center justify-center font-semibold"
        style={{
          width: 22,
          height: 22,
          borderRadius: 999,
          fontSize: 11,
          backgroundColor: "#ede8e0",
          color: TOKENS.primary
        }}
        aria-hidden
      >
        {initial}
      </span>
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
      <button
        type="button"
        className="flex h-6 w-6 shrink-0 items-center justify-center rounded border-0 bg-transparent p-0 outline-none"
        style={{ color: TOKENS.tertiary }}
        aria-label={`Remove ${user.name}`}
        onClick={onRemove}
      >
        <Icon name="close" size={14} />
      </button>
    </div>
  );
}

function DlsCheckboxRow({
  id,
  checked,
  onChange,
  label
}: {
  id: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border border-solid focus-visible:outline focus-visible:ring-2 focus-visible:ring-offset-1"
        style={{
          borderColor: TOKENS.borderDefault,
          accentColor: TOKENS.brand
        }}
      />
      <label
        htmlFor={id}
        className="cursor-pointer"
        style={{
          fontSize: 13,
          fontWeight: 400,
          lineHeight: 1.5,
          letterSpacing: "0.26px",
          color: TOKENS.primary
        }}
      >
        {label}
      </label>
    </div>
  );
}

function DlsTextareaMd({
  id,
  value,
  onChange,
  placeholder
}: {
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [focused, setFocused] = useState(false);
  const [hover, setHover] = useState(false);

  const borderColor = focused
    ? TOKENS.brand
    : hover
      ? "#c9c0b4"
      : TOKENS.borderDefault;

  return (
    <div
      className="relative w-full"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <textarea
        id={id}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        className="box-border w-full resize-y border border-solid outline-none transition-[border-color,box-shadow] duration-150"
        style={{
          minHeight: 91,
          height: 91,
          borderRadius: TOKENS.radiusInput,
          padding: "10px 12px 28px 12px",
          fontSize: 13,
          fontWeight: 400,
          lineHeight: 1.5,
          letterSpacing: "0.26px",
          color: TOKENS.primary,
          borderColor,
          backgroundColor: SURFACE,
          boxShadow: focused ? "0 0 0 3px rgba(107,30,46,0.12)" : "none"
        }}
      />
      <span
        className="pointer-events-none absolute bottom-2 right-2"
        style={{ color: TOKENS.tertiary }}
        aria-hidden
      >
        <span className="inline-flex" style={{ color: TOKENS.tertiary }}>
          <Icon name="stretch" size={14} />
        </span>
      </span>
    </div>
  );
}

function RelatedProblemsMenu({
  id,
  labelId,
  problems,
  value,
  onChange,
  open,
  onOpenChange
}: {
  id: string;
  labelId: string;
  problems: ProjectProblem[];
  value: string[];
  onChange: (ids: string[]) => void;
  open: boolean;
  onOpenChange: (o: boolean) => void;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const allIds = problems.map((p) => p.id);
  const allSelected =
    allIds.length > 0 && allIds.every((idItem) => value.includes(idItem));
  const someSelected = value.length > 0 && !allSelected;
  const selectAllRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = someSelected;
    }
  }, [someSelected]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onOpenChange]);

  function toggleSelectAll() {
    if (allSelected) {
      onChange([]);
    } else {
      onChange([...allIds]);
    }
  }

  function toggleOne(problemId: string) {
    if (value.includes(problemId)) {
      onChange(value.filter((x) => x !== problemId));
    } else {
      onChange([...value, problemId]);
    }
  }

  const summary =
    value.length === 0
      ? "Select relevant project problems"
      : value.length === 1
        ? problems.find((p) => p.id === value[0])?.description ?? "1 selected"
        : `${value.length} problems selected`;

  return (
    <div ref={rootRef} className="relative w-full">
      <Button
        type="button"
        id={id}
        variant="secondary"
        label={summary}
        icon="trailing"
        iconName="chevron-down"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={labelId}
        className="w-full justify-start !h-8 !min-h-0"
        style={{
          borderColor: open ? TOKENS.brand : TOKENS.borderDefault,
          boxShadow: open ? "0 0 0 3px rgba(107,30,46,0.12)" : "none",
          color: value.length === 0 ? TOKENS.tertiary : TOKENS.primary,
          backgroundColor: SURFACE
        }}
        onClick={() => onOpenChange(!open)}
      />
      {open ? (
        <ul
          role="listbox"
          aria-multiselectable="true"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-56 overflow-auto border border-solid py-1 shadow-lg"
          style={{
            borderColor: TOKENS.borderSubtle,
            borderRadius: TOKENS.radiusInput,
            backgroundColor: SURFACE
          }}
        >
          <li
            role="option"
            aria-selected={allSelected}
            className="border-0 border-b border-solid px-2 py-1.5"
            style={{ borderColor: TOKENS.borderSubtle }}
          >
            <label className="flex cursor-pointer items-center gap-2 px-1 py-1 text-[13px] font-medium leading-[1.5] tracking-[0.26px] hover:bg-[#faf8f6]">
              <input
                ref={selectAllRef}
                type="checkbox"
                className="h-4 w-4 shrink-0 rounded border border-solid"
                style={{ borderColor: TOKENS.borderDefault, accentColor: TOKENS.brand }}
                checked={allSelected}
                onChange={toggleSelectAll}
              />
              <span style={{ color: TOKENS.primary }}>Select all</span>
            </label>
          </li>
          {problems.map((p) => {
            const selected = value.includes(p.id);
            return (
              <li key={p.id} role="option" aria-selected={selected}>
                <label className="flex cursor-pointer items-start gap-2 px-3 py-2 text-[13px] leading-[1.5] tracking-[0.26px] hover:bg-[#faf8f6]">
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 shrink-0 rounded border border-solid"
                    style={{
                      borderColor: TOKENS.borderDefault,
                      accentColor: TOKENS.brand
                    }}
                    checked={selected}
                    onChange={() => toggleOne(p.id)}
                  />
                  <span style={{ color: TOKENS.primary }}>{p.description}</span>
                </label>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}

function ReviewerSearchField({
  id,
  labelId,
  query,
  onQueryChange,
  open,
  onOpenChange,
  filteredOptions,
  onPick,
  excludeIds
}: {
  id: string;
  labelId: string;
  query: string;
  onQueryChange: (q: string) => void;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  filteredOptions: User[];
  onPick: (u: User) => void;
  excludeIds: Set<string>;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) {
        onOpenChange(false);
      }
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onOpenChange]);

  const borderColor = focused
    ? TOKENS.brand
    : open
      ? TOKENS.brand
      : TOKENS.borderDefault;

  return (
    <div ref={rootRef} className="relative w-full">
      <div
        className="relative flex w-full items-center border border-solid transition-[border-color,box-shadow] duration-150"
        style={{
          height: 32,
          borderRadius: TOKENS.radiusInput,
          padding: "0 12px",
          gap: 8,
          borderColor,
          backgroundColor: SURFACE,
          boxShadow: focused ? "0 0 0 3px rgba(107,30,46,0.12)" : "none"
        }}
      >
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          aria-haspopup="listbox"
          aria-labelledby={labelId}
          autoComplete="off"
          value={query}
          placeholder="Find teammates"
          onChange={(e) => {
            onQueryChange(e.target.value);
            onOpenChange(true);
          }}
          onFocus={() => {
            setFocused(true);
            onOpenChange(true);
          }}
          onBlur={() => setFocused(false)}
          className="min-w-0 flex-1 border-0 bg-transparent p-0 text-[13px] font-normal leading-[1.5] tracking-[0.26px] outline-none"
          style={{
            color: query ? TOKENS.primary : TOKENS.tertiary
          }}
        />
        <span className="inline-flex shrink-0 text-[#998c82]" aria-hidden>
          <Icon name="search" size={16} />
        </span>
      </div>
      {open && filteredOptions.length > 0 ? (
        <ul
          id={`${id}-listbox`}
          role="listbox"
          className="absolute left-0 right-0 top-[calc(100%+4px)] z-20 max-h-48 overflow-auto border border-solid py-1 shadow-lg"
          style={{
            borderColor: TOKENS.borderSubtle,
            borderRadius: TOKENS.radiusInput,
            backgroundColor: SURFACE
          }}
        >
          {filteredOptions
            .filter((u) => !excludeIds.has(u.id))
            .map((u) => (
              <li
                key={u.id}
                role="option"
                aria-selected={false}
                className="cursor-pointer px-3 py-2 text-[13px] leading-[1.5] tracking-[0.26px] hover:bg-[#faf8f6]"
                style={{ color: TOKENS.primary }}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onPick(u);
                }}
              >
                {u.name}
              </li>
            ))}
        </ul>
      ) : null}
    </div>
  );
}

function decisionMakerHelperVisible(
  reviewType: ReviewType,
  wantsDecisionMaker: boolean
) {
  if (reviewType === "compare") return true;
  if (reviewType === "critique" || reviewType === "align") {
    return wantsDecisionMaker;
  }
  return false;
}

function step2SubmitEnabled(
  reviewType: ReviewType,
  wantsDecisionMaker: boolean,
  reviewers: User[]
) {
  if (reviewers.length === 0) return false;
  if (reviewType === "compare" || reviewType === "approve") {
    return true;
  }
  if (wantsDecisionMaker) {
    return reviewers.length >= 2;
  }
  return reviewers.length >= 1;
}

function requireDecisionMakerForDb(
  reviewType: ReviewType,
  wantsDecisionMaker: boolean
): boolean {
  if (reviewType === "compare" || reviewType === "approve") return true;
  return wantsDecisionMaker;
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
  onCreateReview
}: CreateReviewDrawerProps) {
  const titleInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentStep, setCurrentStep] = useState<1 | 2>(1);
  const [reviewTitle, setReviewTitle] = useState("");
  const [reviewType, setReviewType] = useState<ReviewType>("compare");
  const [artifacts, setArtifacts] = useState<ArtifactDraft[]>([]);
  const [reviewers, setReviewers] = useState<User[]>([]);
  const [sendNotification, setSendNotification] = useState(true);
  const [relatedProblems, setRelatedProblems] = useState<string[]>([]);
  const [reviewFocus, setReviewFocus] = useState("");
  const [wantsDecisionMaker, setWantsDecisionMaker] = useState(false);

  const [reviewerQuery, setReviewerQuery] = useState("");
  const [reviewerMenuOpen, setReviewerMenuOpen] = useState(false);
  const [problemsMenuOpen, setProblemsMenuOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const uid = useId();
  const titleFieldId = `${uid}-title`;
  const typeFieldId = `${uid}-type`;
  const relatedProjectFieldId = `${uid}-related-project`;
  const reviewersFieldId = `${uid}-reviewers`;
  const reviewersLabelId = `${uid}-reviewers-label`;
  const notifyFieldId = `${uid}-notify`;
  const problemsFieldId = `${uid}-problems`;
  const problemsLabelId = `${uid}-problems-label`;
  const focusFieldId = `${uid}-focus`;
  const dmCheckboxId = `${uid}-dm-opt`;

  const reset = useCallback(() => {
    setCurrentStep(1);
    setReviewTitle("");
    setReviewType("compare");
    setArtifacts([]);
    setReviewers([]);
    setSendNotification(true);
    setRelatedProblems([]);
    setReviewFocus("");
    setWantsDecisionMaker(false);
    setReviewerQuery("");
    setReviewerMenuOpen(false);
    setProblemsMenuOpen(false);
    setSubmitting(false);
    setSubmitError(null);
  }, []);

  useEffect(() => {
    if (!open) {
      reset();
    }
  }, [open, reset]);

  useEffect(() => {
    setReviewers([]);
  }, [reviewerPoolKey]);

  useEffect(() => {
    setRelatedProblems([]);
  }, [reviewerPoolKey]);

  useEffect(() => {
    if (reviewType === "compare" || reviewType === "approve") {
      setWantsDecisionMaker(false);
    }
  }, [reviewType]);

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
    artifacts.length <= 2 &&
    artifacts.every((a) => {
      if (!a.title.trim()) return false;
      if (a.kind === "file") return Boolean(a.file);
      return isValidHttpUrl(a.linkUrl);
    });

  const step1NextActive =
    relatedProjectOk &&
    reviewTitle.trim().length > 0 &&
    Boolean(effectiveProjectId) &&
    artifactsValid;

  const step2CreateActive = step2SubmitEnabled(
    reviewType,
    wantsDecisionMaker,
    reviewers
  );

  const filteredTeammates = teammateOptions.filter((u) => {
    const q = reviewerQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      u.name.toLowerCase().includes(q) ||
      (u.email?.toLowerCase().includes(q) ?? false)
    );
  });

  const reviewerExclude = new Set(reviewers.map((r) => r.id));

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const list = e.target.files;
    if (!list?.length) return;
    if (artifacts.length >= 2) {
      e.target.value = "";
      return;
    }
    const file = list[0];
    setArtifacts((prev) => [...prev, newArtifact("file", file)]);
    e.target.value = "";
  }

  function addLinkArtifact() {
    if (artifacts.length >= 2) return;
    setArtifacts((prev) => [...prev, newArtifact("link", null)]);
  }

  const selectedProjectName = projectMenuOptions.find(
    (p) => p.id === selectedRelatedProjectId
  )?.name;

  async function handleCreateReview() {
    if (!step2CreateActive || submitting) return;
    setSubmitError(null);
    const projectId = effectiveProjectId.trim();
    if (!projectId) {
      setSubmitError("Select a project.");
      return;
    }

    const artifactPayload: ArtifactDraftForSubmit[] = artifacts.map((a) => ({
      kind: a.kind,
      file: a.file,
      linkUrl: a.linkUrl,
      title: a.title,
      iterationLabel: a.iterationLabel,
      description: a.description
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
      requireDecisionMaker: requireDecisionMakerForDb(
        reviewType,
        wantsDecisionMaker
      ),
      ownerDisplayName: reviewers[0]?.name ?? "Reviewer",
      artifacts: artifactPayload
    };

    setSubmitting(true);
    const { error } = await onCreateReview(input);
    setSubmitting(false);
    if (error) {
      setSubmitError(error);
      return;
    }
    onClose();
  }

  if (!open) {
    return null;
  }

  return (
    <aside
      role="dialog"
      aria-modal="true"
      aria-label="Create a new design review"
      className="fixed right-0 top-0 z-40 flex flex-col bg-white"
      style={{
        width: 480,
        height: "100vh",
        maxHeight: "100vh",
        backgroundColor: SURFACE,
        boxShadow:
          "-2px 0px 4px rgba(41,33,28,0.08), -8px 0px 24px rgba(41,33,28,0.18)",
        isolation: "isolate"
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        onChange={handleFileChange}
      />

      <header
        className="shrink-0 bg-white"
        style={{
          padding: "20px 24px 16px",
          backgroundColor: SURFACE
        }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h2
              style={{
                fontSize: 18,
                fontWeight: 600,
                lineHeight: 1.5,
                color: TOKENS.heading,
                margin: 0
              }}
            >
              Create a new design review
            </h2>
            <p
              className="mt-1"
              style={{
                fontSize: 13,
                fontWeight: 400,
                lineHeight: 1.5,
                letterSpacing: "0.26px",
                color: TOKENS.tertiary,
                margin: 0
              }}
            >
              Step {currentStep} of 2
            </p>
          </div>
          <button
            type="button"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded border-0 bg-transparent p-0 outline-none"
            style={{ color: TOKENS.tertiary }}
            aria-label="Close drawer"
            onClick={onClose}
          >
            <Icon name="close" size={14} />
          </button>
        </div>
        <div
          className="mt-4"
          style={{ height: 1, backgroundColor: TOKENS.borderSubtle }}
          aria-hidden
        />
      </header>

      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden bg-white"
        style={{ backgroundColor: SURFACE }}
      >
        <div
          className="form-content-zone flex min-h-0 flex-1 flex-col overflow-y-auto bg-white"
          style={{
            padding: "20px 24px",
            gap: 24,
            backgroundColor: SURFACE
          }}
        >
          {currentStep === 1 ? (
            <>
              <Input
                ref={titleInputRef}
                fieldId={titleFieldId}
                type="text"
                label="Review title"
                required
                value={reviewTitle}
                onChange={(e) => setReviewTitle(e.target.value)}
                placeholder="e.g. Navigation Review"
                size="sm"
              />

              <div>
                <DlsLabelSmall htmlFor={typeFieldId}>Review type*</DlsLabelSmall>
                <DlsSelectSingleSm
                  id={typeFieldId}
                  value={reviewType}
                  onChange={setReviewType}
                  options={REVIEW_TYPE_OPTIONS}
                />
              </div>

              {!projectScoped ? (
                <div>
                  <DlsLabelSmall htmlFor={relatedProjectFieldId}>
                    Select related project*
                  </DlsLabelSmall>
                  <DlsSelectRelatedProjectSm
                    id={relatedProjectFieldId}
                    value={selectedRelatedProjectId}
                    onChange={onSelectedRelatedProjectIdChange}
                    options={projectMenuOptions}
                  />
                  {selectedRelatedProjectId && selectedProjectName ? (
                    <SelectedProjectSummary name={selectedProjectName} />
                  ) : null}
                </div>
              ) : null}

              <div className="flex flex-col" style={{ gap: 12 }}>
                <div
                  className="block"
                  style={{
                    fontSize: 13,
                    fontWeight: 500,
                    lineHeight: 1.5,
                    letterSpacing: "0.26px",
                    color: TOKENS.primary,
                    marginBottom: 6
                  }}
                >
                  Artifacts*
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
                    disabled={artifacts.length >= 2}
                    onClick={addLinkArtifact}
                  />
                  <Button
                    type="button"
                    variant="secondary"
                    label="Upload file"
                    icon="leading"
                    iconName="upload"
                    size="sm"
                    disabled={artifacts.length >= 2}
                    onClick={() => fileInputRef.current?.click()}
                  />
                </div>
                {artifacts.map((a, idx) => (
                  <ArtifactEditorCard
                    key={a.localKey}
                    draft={a}
                    onChange={(next) => {
                      setArtifacts((prev) => {
                        const copy = [...prev];
                        copy[idx] = next;
                        return copy;
                      });
                    }}
                    onRemove={() => {
                      setArtifacts((prev) => prev.filter((x) => x.localKey !== a.localKey));
                    }}
                  />
                ))}
              </div>
            </>
          ) : (
            <>
              <div>
                <DlsLabelSmall
                  id={reviewersLabelId}
                  htmlFor={reviewersFieldId}
                >
                  Add reviewers*
                </DlsLabelSmall>
                <ReviewerSearchField
                  id={reviewersFieldId}
                  labelId={reviewersLabelId}
                  query={reviewerQuery}
                  onQueryChange={setReviewerQuery}
                  open={reviewerMenuOpen}
                  onOpenChange={setReviewerMenuOpen}
                  filteredOptions={filteredTeammates}
                  excludeIds={reviewerExclude}
                  onPick={(u) => {
                    setReviewers((prev) =>
                      prev.some((x) => x.id === u.id) ? prev : [...prev, u]
                    );
                    setReviewerQuery("");
                    setReviewerMenuOpen(false);
                  }}
                />
                {decisionMakerHelperVisible(reviewType, wantsDecisionMaker) ? (
                  <p
                    className="mt-2"
                    style={{
                      fontSize: 12,
                      fontWeight: 400,
                      lineHeight: 1.5,
                      letterSpacing: "0.24px",
                      color: TOKENS.secondary,
                      margin: 0
                    }}
                  >
                    The first reviewer selected will be the final decision maker.
                  </p>
                ) : null}
                {(reviewType === "critique" || reviewType === "align") ? (
                  <div className="mt-3">
                    <DlsCheckboxRow
                      id={dmCheckboxId}
                      checked={wantsDecisionMaker}
                      onChange={setWantsDecisionMaker}
                      label="Require a final decision maker"
                    />
                  </div>
                ) : null}
                {reviewers.length > 0 ? (
                  <div
                    className="mt-3 flex flex-wrap"
                    style={{ gap: 8 }}
                    aria-live="polite"
                  >
                    {reviewers.map((u) => (
                      <StakeholderChip
                        key={u.id}
                        user={u}
                        onRemove={() =>
                          setReviewers((prev) => prev.filter((x) => x.id !== u.id))
                        }
                      />
                    ))}
                  </div>
                ) : null}
              </div>

              <div>
                <DlsCheckboxRow
                  id={notifyFieldId}
                  checked={sendNotification}
                  onChange={setSendNotification}
                  label="Send notification on create"
                />
              </div>

              <div>
                <DlsLabelSmall
                  id={problemsLabelId}
                  htmlFor={problemsFieldId}
                >
                  Related problems
                </DlsLabelSmall>
                <RelatedProblemsMenu
                  id={problemsFieldId}
                  labelId={problemsLabelId}
                  problems={projectProblems}
                  value={relatedProblems}
                  onChange={setRelatedProblems}
                  open={problemsMenuOpen}
                  onOpenChange={setProblemsMenuOpen}
                />
              </div>

              <div>
                <DlsLabelSmall htmlFor={focusFieldId}>Review focus</DlsLabelSmall>
                <DlsTextareaMd
                  id={focusFieldId}
                  value={reviewFocus}
                  onChange={setReviewFocus}
                  placeholder="What initial focus or questions do you have for the reviewers?"
                />
              </div>
            </>
          )}
        </div>
      </div>

      <footer
        className="shrink-0 border-t border-solid bg-white"
        style={{
          borderColor: TOKENS.borderSubtle,
          padding: "16px 24px",
          backgroundColor: SURFACE
        }}
      >
        {submitError ? (
          <p
            className="mb-3 m-0 text-[13px] leading-[1.5]"
            style={{ color: TOKENS.error }}
            role="alert"
          >
            {submitError}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-4">
          <div
            className="min-w-0 shrink-0"
            style={{
              width: 72,
              visibility: currentStep === 1 ? "visible" : "hidden"
            }}
            aria-hidden={currentStep === 2}
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
                  onClick={onClose}
                />
                <Button
                  type="button"
                  variant="primary"
                  label="Next"
                  icon="trailing"
                  iconName="chevron-right"
                  size="sm"
                  disabled={!step1NextActive}
                  onClick={() => {
                    if (!step1NextActive) return;
                    setCurrentStep(2);
                  }}
                />
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="secondary"
                  label="Back"
                  icon="leading"
                  iconName="chevron-left"
                  size="sm"
                  disabled={submitting}
                  onClick={() => setCurrentStep(1)}
                />
                <Button
                  type="button"
                  variant="primary"
                  label={submitting ? "Saving…" : "Create Review"}
                  icon={submitting ? "none" : "trailing"}
                  iconName="chevron-right"
                  size="sm"
                  disabled={!step2CreateActive || submitting}
                  onClick={() => void handleCreateReview()}
                />
              </>
            )}
          </div>
        </div>
      </footer>
    </aside>
  );
}
