"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "@/lib/phosphor";
import {
  Button,
  Divider,
  FilterPanel,
  Icon,
  NotificationBadge,
  PageHeader,
  ReviewCard,
  ShowAccordion,
  Tooltip,
  type ReviewStatus
} from "@/components/ui/ds";
import { useNewReviewDrawer } from "@/components/NewReviewDrawerProvider";
import { useActiveWorkspacePermission } from "@/hooks/useWorkspacePermission";
import { canCreateReviews, CREATE_REVIEW_DENIED_TOOLTIP } from "@/lib/workspace/permissions";
import { STATUS_DISPLAY_LABELS } from "@/lib/reviews/reviewStatusDisplay";

export type AllReviewsRow = {
  id: string;
  title: string;
  status: string;
  decision_status: string | null;
  require_decision_maker: boolean;
  updated_ago: string;
  date_tooltip_iso?: string | null;
  project_id: string;
  project_name: string;
  client_name: string | null;
  description?: string | null;
  /** Review creator display name (`reviews.owner_display_name`). */
  owner_display_name: string | null;
  feedback_count: number;
  change_request_count: number;
  contributor_names: string[];
  reviewers?: Array<{
    id?: string;
    name: string;
    avatarSrc?: string | null;
  }>;
};

export type AllReviewsGroupedByType = {
  compare: AllReviewsRow[];
  approve: AllReviewsRow[];
  critique: AllReviewsRow[];
  align: AllReviewsRow[];
};

type SectionKey = keyof AllReviewsGroupedByType;

type SectionPresentation = {
  key: SectionKey;
  title: string;
  description: string;
  trailingBadgeLabel?: string;
};

type StatusFilterKey =
  | "inReview"
  | "feedbackSubmitted"
  | "changesNeeded"
  | "draft"
  | "paused"
  | "approvedComplete"
  | "archived";

const MAX_VISIBLE = 8;

const SECTIONS: SectionPresentation[] = [
  {
    key: "align",
    title: "Align",
    description:
      "Alignment Reviews check whether the proposed direction aligns with project goals and brand guidelines."
  },
  {
    key: "compare",
    title: "Compare",
    description:
      "Comparison Reviews are used when seeking design direction by comparing options against each other.",
    trailingBadgeLabel: "Decision Maker: Required"
  },
  {
    key: "critique",
    title: "Critique",
    description:
      "Critique Reviews invite stakeholders to examine your artefacts and leave detailed feedback."
  },
  {
    key: "approve",
    title: "Approve",
    description:
      "Approval Reviews are used to obtain sign-off and feedback prior to reaching a project milestone."
  }
];

const STATUS_FILTER_STORAGE_KEY = "designtrace_reviews_filter_statuses";
const STATUS_FILTER_KEYS: StatusFilterKey[] = [
  "inReview",
  "feedbackSubmitted",
  "changesNeeded",
  "draft",
  "paused",
  "approvedComplete",
  "archived",
];

const FILTER_DEFINITIONS: Array<{
  key: StatusFilterKey;
  label: string;
  group: "active" | "closed";
}> = [
  { key: "inReview", label: STATUS_DISPLAY_LABELS["in-review"], group: "active" },
  { key: "feedbackSubmitted", label: STATUS_DISPLAY_LABELS["feedback-submitted"], group: "active" },
  { key: "changesNeeded", label: STATUS_DISPLAY_LABELS["needs-changes"], group: "active" },
  { key: "draft", label: STATUS_DISPLAY_LABELS.draft, group: "active" },
  { key: "paused", label: STATUS_DISPLAY_LABELS.paused, group: "active" },
  { key: "approvedComplete", label: "Approved/Complete", group: "closed" },
  { key: "archived", label: "Archived", group: "closed" },
];

function accordionStorageKey(sectionId: SectionKey) {
  return `designtrace_accordion_${sectionId}`;
}

function readStoredBoolean(key: string, fallback: boolean) {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(key);
    if (stored == null) return fallback;
    if (stored === "true") return true;
    if (stored === "false") return false;
    const parsed = JSON.parse(stored) as boolean;
    return typeof parsed === "boolean" ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function writeStoredBoolean(key: string, value: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Ignore storage failures (private mode, quota, etc).
  }
}

function statusFilterKeyForReview(status: string): StatusFilterKey {
  const normalized = status.trim().toLowerCase();
  if (normalized === "archived") return "archived";
  if (normalized === "approved" || normalized === "complete") return "approvedComplete";
  if (normalized === "feedback-submitted") return "feedbackSubmitted";
  if (normalized === "needs-changes" || normalized === "changes-needed") {
    return "changesNeeded";
  }
  if (normalized === "draft") return "draft";
  if (normalized === "paused") return "paused";
  return "inReview";
}

function toReviewStatus(status: string): ReviewStatus {
  const normalized = status.trim().toLowerCase();
  const allowed: ReviewStatus[] = [
    "draft",
    "in-review",
    "feedback-submitted",
    "paused",
    "complete",
    "approved",
    "needs-changes",
    "changes-needed",
    "blocked",
    "archived"
  ];
  return allowed.includes(normalized as ReviewStatus)
    ? (normalized as ReviewStatus)
    : "in-review";
}

/** Same accordion header pattern as `ProjectsView` (`AccordionHeaderRow`), with review count badge. */
function AccordionHeaderRow({
  title,
  count,
  open,
  disabled,
  onToggle,
  description,
  trailingBadgeLabel,
}: {
  title: string;
  count: number;
  open: boolean;
  disabled: boolean;
  onToggle: () => void;
  description: string;
  trailingBadgeLabel?: string;
}) {
  let iconColor: string;
  const labelColor = disabled ? "#998c82" : open ? "#6b1e2e" : "#6b5e55";
  iconColor = disabled ? "#998c82" : "#6b5e55";

  const chevronEl = open ? (
    <ChevronUp size={12} weight="fill" color={iconColor} />
  ) : (
    <ChevronDown size={12} weight="fill" color={iconColor} />
  );

  const rowInner = (
    <>
      <span
        className="flex h-8 w-8 shrink-0 items-center justify-center"
        style={{ borderRadius: 4 }}
      >
        {chevronEl}
      </span>
      <span
        className="ml-2 shrink-0 text-[18px] font-semibold leading-[1.5]"
        style={{ color: labelColor }}
      >
        {title}
      </span>
      <span className="ml-3 inline-flex shrink-0 items-center self-center">
        <NotificationBadge
          count={count}
          sentiment="brand"
          prominence={open ? "high" : "low"}
        />
      </span>
      <Divider className="ml-3 min-w-0 flex-1" />
    </>
  );

  const infoButton = (
    <Tooltip
      label={description}
      supportingText={trailingBadgeLabel}
      position="left"
      maxWidth={320}
    >
      <button
        type="button"
        aria-label={`About ${title} reviews`}
        onClick={(event) => event.stopPropagation()}
        className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[6px] border-0 bg-transparent p-0 text-[#998c82] transition-colors duration-150 hover:text-[#6b5e55]"
      >
        <Icon name="info" size={16} />
      </button>
    </Tooltip>
  );

  if (disabled) {
    return (
      <div className="flex w-full items-center gap-2" aria-disabled="true">
        <div className="flex w-full cursor-default items-center">{rowInner}</div>
        {infoButton}
      </div>
    );
  }

  return (
    <div className="flex w-full items-center gap-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full cursor-pointer items-center border-0 bg-transparent p-0 text-left"
        aria-expanded={open}
      >
        {rowInner}
      </button>
      {infoButton}
    </div>
  );
}

function reviewMatchesQuery(row: AllReviewsRow, q: string): boolean {
  if (!q) return true;
  const reviewerNames = (row.reviewers ?? []).map((reviewer) => reviewer.name).join("\0");
  const hay = [row.title, row.description ?? "", row.owner_display_name ?? "", reviewerNames]
    .join("\0")
    .toLowerCase();
  return hay.includes(q);
}

function buildVisibleStatusSet(selectedStatuses: Set<StatusFilterKey>) {
  const visible = new Set<string>();
  if (selectedStatuses.has("inReview")) visible.add("in-review");
  if (selectedStatuses.has("feedbackSubmitted")) visible.add("feedback-submitted");
  if (selectedStatuses.has("changesNeeded")) {
    visible.add("needs-changes");
    visible.add("changes-needed");
  }
  if (selectedStatuses.has("draft")) visible.add("draft");
  if (selectedStatuses.has("paused")) visible.add("paused");
  if (selectedStatuses.has("approvedComplete")) {
    visible.add("approved");
    visible.add("complete");
  }
  if (selectedStatuses.has("archived")) visible.add("archived");
  return visible;
}

export function AllReviewsView({
  grouped,
  searchPlaceholder
}: {
  grouped: AllReviewsGroupedByType;
  searchPlaceholder: string;
}) {
  const router = useRouter();
  const { openNewReview } = useNewReviewDrawer();
  const [searchQuery, setSearchQuery] = useState("");
  const { permissionLevel } = useActiveWorkspacePermission();
  const canCreateReview = canCreateReviews(permissionLevel);
  const filterButtonRef = useRef<HTMLDivElement | null>(null);
  const filterPanelRef = useRef<HTMLDivElement | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);

  const handleNewReview = () => {
    openNewReview({ mode: "global" });
  };

  const [openState, setOpenState] = useState<Record<SectionKey, boolean>>({
    align: false,
    compare: false,
    critique: false,
    approve: false,
  });
  const [expandedState, setExpandedState] = useState<Record<SectionKey, boolean>>({
    align: false,
    compare: false,
    critique: false,
    approve: false
  });
  const [selectedStatuses, setSelectedStatuses] = useState<Set<StatusFilterKey>>(
    () => new Set(STATUS_FILTER_KEYS)
  );
  const [draftSelectedStatuses, setDraftSelectedStatuses] = useState<Set<StatusFilterKey>>(
    () => new Set(STATUS_FILTER_KEYS)
  );

  const activeFilterStatuses = useMemo(
    () => buildVisibleStatusSet(selectedStatuses),
    [selectedStatuses],
  );
  const filteredGrouped = useMemo((): AllReviewsGroupedByType => {
    const q = searchQuery.trim().toLowerCase();
    const filterRows = (rows: AllReviewsRow[]) =>
      rows.filter((row) => {
        if (!activeFilterStatuses.has(row.status.trim().toLowerCase())) return false;
        return q ? reviewMatchesQuery(row, q) : true;
      });
    return {
      align: filterRows(grouped.align),
      compare: filterRows(grouped.compare),
      critique: filterRows(grouped.critique),
      approve: filterRows(grouped.approve),
    };
  }, [activeFilterStatuses, grouped, searchQuery]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOpenState({
      align: readStoredBoolean(accordionStorageKey("align"), false),
      compare: readStoredBoolean(accordionStorageKey("compare"), false),
      approve: readStoredBoolean(accordionStorageKey("approve"), false),
      critique: readStoredBoolean(accordionStorageKey("critique"), false),
    });
    try {
      const storedFilters = window.localStorage.getItem(STATUS_FILTER_STORAGE_KEY);
      if (!storedFilters) return;
      const parsed = JSON.parse(storedFilters) as string[];
      const nextSelected = new Set(
        Array.isArray(parsed)
          ? parsed.filter((value): value is StatusFilterKey =>
              STATUS_FILTER_KEYS.includes(value as StatusFilterKey)
            )
          : STATUS_FILTER_KEYS
      );
      setSelectedStatuses(nextSelected);
      setDraftSelectedStatuses(new Set(nextSelected));
    } catch {
      setSelectedStatuses(new Set(STATUS_FILTER_KEYS));
      setDraftSelectedStatuses(new Set(STATUS_FILTER_KEYS));
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        STATUS_FILTER_STORAGE_KEY,
        JSON.stringify(Array.from(selectedStatuses))
      );
    } catch {
      // Ignore storage failures.
    }
  }, [selectedStatuses]);

  useEffect(() => {
    if (!filterOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        filterButtonRef.current?.contains(target) ||
        filterPanelRef.current?.contains(target)
      ) {
        return;
      }
      setFilterOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [filterOpen]);

  const pageHeaderPrimary = canCreateReview ? (
    <Button
      type="button"
      variant="primary"
      size="sm"
      label="Review"
      icon="leading"
      iconName="plus"
      onClick={handleNewReview}
    />
  ) : (
    <Tooltip label={CREATE_REVIEW_DENIED_TOOLTIP} position="bottom">
      <span style={{ display: "inline-flex" }}>
        <Button
          type="button"
          variant="primary"
          size="sm"
          label="Review"
          icon="leading"
          iconName="plus"
          disabled
          onClick={handleNewReview}
        />
      </span>
    </Tooltip>
  );

  const selectedStatusCount = selectedStatuses.size;
  const hiddenStatusCount = STATUS_FILTER_KEYS.length - selectedStatusCount;
  const showInlineFilterBadge = hiddenStatusCount > 0;
  const draftSelectedCount = draftSelectedStatuses.size;
  const allDraftChecked = draftSelectedCount === STATUS_FILTER_KEYS.length;
  const allDraftIndeterminate =
    draftSelectedCount > 0 && draftSelectedCount < STATUS_FILTER_KEYS.length;
  const isDraftAtDefault = draftSelectedCount === STATUS_FILTER_KEYS.length;
  const isApplyEnabled = useMemo(() => {
    if (draftSelectedStatuses.size !== selectedStatuses.size) return true;
    for (const key of STATUS_FILTER_KEYS) {
      if (draftSelectedStatuses.has(key) !== selectedStatuses.has(key)) return true;
    }
    return false;
  }, [draftSelectedStatuses, selectedStatuses]);

  const statusFilterGroups = useMemo(
    () =>
      (["active", "closed"] as const).map((group) => ({
        id: group,
        heading: group === "active" ? "ACTIVE" : "CLOSED",
        items: FILTER_DEFINITIONS.filter((item) => item.group === group).map((item) => ({
          id: item.key,
          label: item.label,
          checked: draftSelectedStatuses.has(item.key),
          onChange: (checked: boolean) =>
            setDraftSelectedStatuses((prev) => {
              const next = new Set(prev);
              if (checked) next.add(item.key);
              else next.delete(item.key);
              return next;
            }),
        })),
      })),
    [draftSelectedStatuses],
  );

  return (
    <div
      className="w-full min-h-0 flex-1"
      style={{
        width: "100%",
        minHeight: 0,
        flex: "1 1 auto",
        backgroundColor: "#faf8f6"
      }}
    >
      <PageHeader
        variant="search"
        searchPlaceholder={searchPlaceholder}
        searchValue={searchQuery}
        onSearch={setSearchQuery}
        primaryActionSlot={pageHeaderPrimary}
      />

      <div
        className="w-full pb-16"
        style={{
          width: "100%",
          paddingLeft: 32,
          paddingTop: 32,
          paddingRight: 32,
          paddingBottom: 64
        }}
      >
        <div className="mb-8 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div
            className="flex min-w-0 flex-wrap items-baseline"
            style={{ gap: 24 }}
          >
            <h1
              className="text-[32px] font-extrabold leading-[1.2]"
              style={{ color: "#6b1e2e", letterSpacing: "-0.96px" }}
            >
              Reviews
            </h1>
            <p
              className="max-w-xl text-[15px] font-normal leading-[1.65]"
              style={{ color: "#6b5e55" }}
            >
              Here are all your reviews, organized by their review type
            </p>
          </div>
          <div ref={filterButtonRef} className="relative shrink-0">
            <div className="relative inline-flex">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                label="Filter"
                icon="leading"
                iconName="filter"
                trailingContent={
                  showInlineFilterBadge ? (
                    <NotificationBadge
                      count={hiddenStatusCount}
                      sentiment="brand"
                      prominence="high"
                    />
                  ) : undefined
                }
                onClick={() => {
                  setDraftSelectedStatuses(new Set(selectedStatuses));
                  setFilterOpen((prev) => !prev);
                }}
              />
            </div>
            {filterOpen ? (
              <div
                ref={filterPanelRef}
                className="absolute right-0 top-[calc(100%+8px)] z-50"
              >
                <FilterPanel
                  idPrefix="reviews-filter"
                  topAllRow={{
                    id: "all",
                    checked: allDraftChecked,
                    indeterminate: allDraftIndeterminate,
                    onChange: (checked) => {
                      setDraftSelectedStatuses(
                        checked ? new Set(STATUS_FILTER_KEYS) : new Set<StatusFilterKey>(),
                      );
                    },
                  }}
                  groups={statusFilterGroups}
                  resetDisabled={isDraftAtDefault}
                  onReset={() => setDraftSelectedStatuses(new Set(STATUS_FILTER_KEYS))}
                  applyDisabled={!isApplyEnabled}
                  onApply={() => {
                    setSelectedStatuses(new Set(draftSelectedStatuses));
                    setFilterOpen(false);
                  }}
                  style={{ minWidth: 240 }}
                />
              </div>
            ) : null}
          </div>
        </div>

        <div className="flex flex-col">
          {SECTIONS.map((section) => {
            const rows = filteredGrouped[section.key];
            if (rows.length === 0) return null;

            const open = openState[section.key];
            const expanded = expandedState[section.key];
            const showToggle = rows.length > MAX_VISIBLE;
            const visibleRows = expanded ? rows : rows.slice(0, MAX_VISIBLE);

            return (
              <section key={section.key} className="w-full">
                <div className="pb-2 pt-1">
                  <AccordionHeaderRow
                    title={section.title}
                    count={rows.length}
                    open={open}
                    disabled={false}
                    description={section.description}
                    trailingBadgeLabel={section.trailingBadgeLabel}
                    onToggle={() =>
                      setOpenState((prev) => {
                        const nextOpen = !prev[section.key];
                        writeStoredBoolean(
                          accordionStorageKey(section.key),
                          nextOpen,
                        );
                        return {
                          ...prev,
                          [section.key]: nextOpen,
                        };
                      })
                    }
                  />
                </div>

                {open ? (
                  <div className="pb-6">
                    <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                      {visibleRows.map((review) => (
                        <ReviewCard
                          key={review.id}
                          title={review.title}
                          status={toReviewStatus(review.status)}
                          reviewType={section.key}
                          decisionStatus={review.decision_status}
                          requireDecisionMaker={review.require_decision_maker}
                          creatorName={
                            review.owner_display_name?.trim() ||
                            undefined
                          }
                          dateLabel={review.updated_ago}
                          dateTooltipIso={review.date_tooltip_iso ?? undefined}
                          breadcrumb={{
                            clientName: review.client_name,
                            projectName: review.project_name,
                            projectId: review.project_id,
                          }}
                          description={review.description ?? undefined}
                          showDetailCounts
                          feedbackCount={review.feedback_count}
                          changeRequestCount={review.change_request_count}
                          reviewers={review.reviewers ?? []}
                          onClick={() => router.push(`/reviews/${review.id}`)}
                        />
                      ))}
                    </div>
                    {showToggle ? (
                      <div className="flex w-full justify-center pt-4">
                        <ShowAccordion
                          state={expanded ? "less" : "more"}
                          showLines={false}
                          onClick={() =>
                            setExpandedState((prev) => ({
                              ...prev,
                              [section.key]: !prev[section.key]
                            }))
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}
