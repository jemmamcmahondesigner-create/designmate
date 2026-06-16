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
import { parseReviewDbStatus } from "@/lib/reviews/reviewStatusDisplay";
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
  /** Canonical contributors.id for creator avatar colour. */
  creator_id?: string | null;
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
  | "draft"
  | "inReview"
  | "feedbackSubmitted"
  | "changesNeeded"
  | "paused"
  | "approved"
  | "complete"
  | "archived";

type StatusFilterState = {
  all: boolean;
  statuses: Set<StatusFilterKey>;
};

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

const SELECTABLE_STATUS_FILTER_KEYS: StatusFilterKey[] = [
  "draft",
  "inReview",
  "feedbackSubmitted",
  "changesNeeded",
  "paused",
  "approved",
  "complete",
];

const FILTER_DEFINITIONS: Array<{
  key: StatusFilterKey;
  label: string;
  disabled?: boolean;
}> = [
  { key: "draft", label: STATUS_DISPLAY_LABELS.draft },
  { key: "inReview", label: STATUS_DISPLAY_LABELS["in-review"] },
  { key: "feedbackSubmitted", label: STATUS_DISPLAY_LABELS["feedback-submitted"] },
  { key: "changesNeeded", label: STATUS_DISPLAY_LABELS["needs-changes"] },
  { key: "paused", label: STATUS_DISPLAY_LABELS.paused },
  { key: "approved", label: STATUS_DISPLAY_LABELS.approved },
  { key: "complete", label: STATUS_DISPLAY_LABELS.complete },
  { key: "archived", label: "Archived", disabled: true },
];

const DEFAULT_STATUS_FILTER: StatusFilterState = {
  all: true,
  statuses: new Set(),
};

function isSelectableStatusFilterKey(value: string): value is StatusFilterKey {
  return SELECTABLE_STATUS_FILTER_KEYS.includes(value as StatusFilterKey);
}

function statusFiltersEqual(a: StatusFilterState, b: StatusFilterState) {
  if (a.all !== b.all) return false;
  if (a.statuses.size !== b.statuses.size) return false;
  for (const key of a.statuses) {
    if (!b.statuses.has(key)) return false;
  }
  return true;
}

function cloneStatusFilter(state: StatusFilterState): StatusFilterState {
  return {
    all: state.all,
    statuses: new Set(state.statuses),
  };
}

function migrateLegacyStatusFilterKeys(values: string[]): Set<StatusFilterKey> {
  const next = new Set<StatusFilterKey>();
  for (const value of values) {
    if (value === "approvedComplete") {
      next.add("approved");
      next.add("complete");
      continue;
    }
    if (isSelectableStatusFilterKey(value)) {
      next.add(value);
    }
  }
  return next;
}

function parseStoredStatusFilter(raw: string | null): StatusFilterState {
  if (!raw) return cloneStatusFilter(DEFAULT_STATUS_FILTER);
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (parsed && typeof parsed === "object" && "all" in parsed) {
      const record = parsed as { all?: unknown; statuses?: unknown };
      const statuses = Array.isArray(record.statuses)
        ? migrateLegacyStatusFilterKeys(record.statuses.map((value) => String(value)))
        : new Set<StatusFilterKey>();
      if (record.all === true) {
        return { all: true, statuses: new Set() };
      }
      return { all: false, statuses };
    }
    if (Array.isArray(parsed)) {
      const legacy = parsed.map((value) => String(value));
      const migrated = migrateLegacyStatusFilterKeys(legacy);
      if (
        legacy.includes("approvedComplete") &&
        migrated.size >= SELECTABLE_STATUS_FILTER_KEYS.length - 1
      ) {
        return cloneStatusFilter(DEFAULT_STATUS_FILTER);
      }
      if (migrated.size === SELECTABLE_STATUS_FILTER_KEYS.length) {
        return cloneStatusFilter(DEFAULT_STATUS_FILTER);
      }
      return { all: false, statuses: migrated };
    }
  } catch {
    // Fall through to default.
  }
  return cloneStatusFilter(DEFAULT_STATUS_FILTER);
}

function serializeStatusFilter(state: StatusFilterState): string {
  return JSON.stringify({
    all: state.all,
    statuses: Array.from(state.statuses),
  });
}

function setStatusFilterAll(checked: boolean): StatusFilterState {
  if (checked) {
    return cloneStatusFilter(DEFAULT_STATUS_FILTER);
  }
  return { all: false, statuses: new Set() };
}

function setStatusFilterItem(
  state: StatusFilterState,
  key: StatusFilterKey,
  checked: boolean,
): StatusFilterState {
  if (key === "archived") return state;

  if (state.all) {
    if (!checked) {
      const nextStatuses = new Set(
        SELECTABLE_STATUS_FILTER_KEYS.filter((item) => item !== key),
      );
      return { all: false, statuses: nextStatuses };
    }
    return { all: false, statuses: new Set([key]) };
  }

  const nextStatuses = new Set(state.statuses);
  if (checked) nextStatuses.add(key);
  else nextStatuses.delete(key);

  if (nextStatuses.size === SELECTABLE_STATUS_FILTER_KEYS.length) {
    return cloneStatusFilter(DEFAULT_STATUS_FILTER);
  }
  return { all: false, statuses: nextStatuses };
}

function accordionStorageKey(sectionId: SectionKey) {
  return `designtrace_accordion_${sectionId}`;
}

const TEXT_DISABLED = "var(--text-disabled, #c9c0b4)";
const ICON_DISABLED = "var(--text-disabled, #c9c0b4)";
const EMPTY_SECTION_TOOLTIP = "No reviews currently exist.";
const FILTER_DISABLED_TOOLTIP = "There are no available reviews to filter.";

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

function toReviewStatus(status: string): ReviewStatus {
  return parseReviewDbStatus(status) as ReviewStatus;
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
  const labelColor = disabled
    ? TEXT_DISABLED
    : open
      ? "#6b1e2e"
      : "#6b5e55";
  iconColor = disabled ? ICON_DISABLED : "#6b5e55";

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
        className="ml-2 shrink-0 text-[18px] leading-[1.5]"
        style={{ color: labelColor, fontWeight: 700 }}
      >
        {title}
      </span>
      {count > 0 ? (
        <span className="ml-3 inline-flex shrink-0 items-center self-center">
          <NotificationBadge
            count={count}
            sentiment={disabled ? "disabled" : "brand"}
            prominence={disabled || !open ? "low" : "high"}
          />
        </span>
      ) : null}
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
      <div className="flex w-full items-center gap-2">
        <Tooltip
          label={EMPTY_SECTION_TOOLTIP}
          position="top"
          fullWidth
          className="min-w-0 flex-1"
        >
          <div
            className="flex w-full cursor-default items-center"
            aria-disabled="true"
          >
            {rowInner}
          </div>
        </Tooltip>
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

function buildVisibleStatusSet(filter: StatusFilterState) {
  if (filter.all) {
    return new Set([
      "in-review",
      "feedback-submitted",
      "needs-changes",
      "changes-needed",
      "draft",
      "paused",
      "approved",
      "complete",
      "archived",
      "blocked",
      "closed",
      "direction-approved",
    ]);
  }

  const visible = new Set<string>();
  if (filter.statuses.has("inReview")) visible.add("in-review");
  if (filter.statuses.has("feedbackSubmitted")) visible.add("feedback-submitted");
  if (filter.statuses.has("changesNeeded")) {
    visible.add("needs-changes");
    visible.add("changes-needed");
  }
  if (filter.statuses.has("draft")) visible.add("draft");
  if (filter.statuses.has("paused")) visible.add("paused");
  if (filter.statuses.has("approved")) visible.add("approved");
  if (filter.statuses.has("complete")) visible.add("complete");
  if (filter.statuses.has("archived")) visible.add("archived");
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
  const { workspacePermissionLevel } = useActiveWorkspacePermission();
  const canCreateReview = canCreateReviews(workspacePermissionLevel);
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
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<StatusFilterState>(
    () => cloneStatusFilter(DEFAULT_STATUS_FILTER),
  );
  const [draftStatusFilter, setDraftStatusFilter] = useState<StatusFilterState>(
    () => cloneStatusFilter(DEFAULT_STATUS_FILTER),
  );

  const activeFilterStatuses = useMemo(
    () => buildVisibleStatusSet(selectedStatusFilter),
    [selectedStatusFilter],
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

  const totalReviewCount = useMemo(
    () =>
      grouped.align.length +
      grouped.compare.length +
      grouped.critique.length +
      grouped.approve.length,
    [grouped],
  );
  const filterDisabled = totalReviewCount === 0;

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOpenState({
      align: readStoredBoolean(accordionStorageKey("align"), false),
      compare: readStoredBoolean(accordionStorageKey("compare"), false),
      approve: readStoredBoolean(accordionStorageKey("approve"), false),
      critique: readStoredBoolean(accordionStorageKey("critique"), false),
    });
    const storedFilters = parseStoredStatusFilter(
      window.localStorage.getItem(STATUS_FILTER_STORAGE_KEY),
    );
    setSelectedStatusFilter(storedFilters);
    setDraftStatusFilter(cloneStatusFilter(storedFilters));
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(
        STATUS_FILTER_STORAGE_KEY,
        serializeStatusFilter(selectedStatusFilter),
      );
    } catch {
      // Ignore storage failures.
    }
  }, [selectedStatusFilter]);

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

  useEffect(() => {
    if (filterDisabled && filterOpen) {
      setFilterOpen(false);
    }
  }, [filterDisabled, filterOpen]);

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

  const activeStatusFilterCount = selectedStatusFilter.all
    ? 0
    : selectedStatusFilter.statuses.size;
  const showInlineFilterBadge = activeStatusFilterCount > 0;
  const hasStatusFilter = !selectedStatusFilter.all;
  const hasSearch = searchQuery.trim() !== "";
  const draftSelectedCount = draftStatusFilter.all
    ? 0
    : draftStatusFilter.statuses.size;
  const allDraftChecked = draftStatusFilter.all;
  const allDraftIndeterminate =
    !draftStatusFilter.all &&
    draftSelectedCount > 0 &&
    draftSelectedCount < SELECTABLE_STATUS_FILTER_KEYS.length;
  const isDraftAtDefault = statusFiltersEqual(draftStatusFilter, DEFAULT_STATUS_FILTER);
  const isApplyEnabled = useMemo(
    () => !statusFiltersEqual(draftStatusFilter, selectedStatusFilter),
    [draftStatusFilter, selectedStatusFilter],
  );

  const statusFilterGroups = useMemo(
    () => [
      {
        id: "statuses",
        heading: "Statuses",
        items: FILTER_DEFINITIONS.map((item) => ({
          id: item.key,
          label: item.label,
          disabled: item.disabled,
          checked: !draftStatusFilter.all && draftStatusFilter.statuses.has(item.key),
          onChange: (checked: boolean) =>
            setDraftStatusFilter((prev) => setStatusFilterItem(prev, item.key, checked)),
        })),
      },
    ],
    [draftStatusFilter],
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
              All workspace reviews organized by their type.
            </p>
          </div>
          <div ref={filterButtonRef} className="relative shrink-0">
            <div className="relative inline-flex">
              {filterDisabled ? (
                <Tooltip label={FILTER_DISABLED_TOOLTIP} position="bottom">
                  <span style={{ display: "inline-flex" }}>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      label="Filter"
                      icon="leading"
                      iconName="filter"
                      disabled
                    />
                  </span>
                </Tooltip>
              ) : (
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
                        count={activeStatusFilterCount}
                        sentiment="brand"
                        prominence="high"
                      />
                    ) : undefined
                  }
                  onClick={() => {
                    setDraftStatusFilter(cloneStatusFilter(selectedStatusFilter));
                    setFilterOpen((prev) => !prev);
                  }}
                />
              )}
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
                      setDraftStatusFilter(setStatusFilterAll(checked));
                    },
                  }}
                  groups={statusFilterGroups}
                  resetDisabled={isDraftAtDefault}
                  onReset={() =>
                    setDraftStatusFilter(cloneStatusFilter(DEFAULT_STATUS_FILTER))
                  }
                  applyDisabled={!isApplyEnabled}
                  onApply={() => {
                    setSelectedStatusFilter(cloneStatusFilter(draftStatusFilter));
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
            const totalInSection = grouped[section.key].length;
            const sectionDisabled =
              !hasSearch && !hasStatusFilter && totalInSection === 0;

            if ((hasSearch || hasStatusFilter) && rows.length === 0) {
              return null;
            }

            const open = sectionDisabled
              ? false
              : hasStatusFilter && rows.length > 0
                ? true
                : openState[section.key];
            const expanded = expandedState[section.key];
            const showToggle = rows.length > MAX_VISIBLE;
            const visibleRows = expanded ? rows : rows.slice(0, MAX_VISIBLE);

            return (
              <section key={section.key} className="w-full">
                <div className="pb-2 pt-1">
                  <AccordionHeaderRow
                    title={section.title}
                    count={sectionDisabled ? totalInSection : rows.length}
                    open={open}
                    disabled={sectionDisabled}
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
                    <div className="grid grid-cols-1 items-stretch gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3">
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
                          creatorId={review.creator_id ?? undefined}
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
