"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronUp } from "@/lib/phosphor";
import {
  Alert,
  Button,
  Divider,
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

export type AllReviewsRow = {
  id: string;
  title: string;
  status: string;
  decision_status: string | null;
  require_decision_maker: boolean;
  updated_ago: string;
  project_name: string;
  client_name: string | null;
  /** Review creator display name (`reviews.owner_display_name`). */
  owner_display_name: string | null;
  decision_count: number;
  contributor_names: string[];
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
  /** Compare only — white pill on the right */
  trailingBadgeLabel?: string;
};

const MAX_VISIBLE = 8;

const SECTIONS: SectionPresentation[] = [
  {
    key: "compare",
    title: "Compare",
    description:
      "Comparison Reviews are used when seeking design direction by comparing options against each other.",
    trailingBadgeLabel: "Decision Maker: Required"
  },
  {
    key: "approve",
    title: "Approve",
    description:
      "Approval Reviews are used to obtain sign-off and feedback prior to reaching a project milestone."
  },
  {
    key: "critique",
    title: "Critique",
    description:
      "Critique Reviews invite stakeholders to examine your artefacts and leave detailed feedback."
  },
  {
    key: "align",
    title: "Align",
    description:
      "Alignment Reviews check whether the proposed direction aligns with project goals and brand guidelines."
  }
];

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
    "blocked"
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
  onToggle
}: {
  title: string;
  count: number;
  open: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  let labelColor: string;
  let iconColor: string;
  if (disabled) {
    labelColor = iconColor = "#998c82";
  } else if (open) {
    labelColor = iconColor = "#6b1e2e";
  } else {
    labelColor = iconColor = "#6b5e55";
  }

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

  if (disabled) {
    return (
      <div
        className="flex w-full cursor-default items-center"
        aria-disabled="true"
      >
        {rowInner}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      className="flex w-full cursor-pointer items-center border-0 bg-transparent p-0 text-left"
      aria-expanded={open}
    >
      {rowInner}
    </button>
  );
}

function SectionTypeAlert({
  description,
  trailingBadgeLabel
}: {
  description: string;
  trailingBadgeLabel?: string;
}) {
  return (
    <div className="mb-4" style={{ width: "fit-content", maxWidth: "100%" }}>
      <Alert
        className="!w-max max-w-full !items-center"
        sentiment="base"
        prominence="low"
        title=""
        body={description}
        bodyClassName="whitespace-nowrap !text-[#2e1c1c]"
        dismissible={false}
        trailingBadgeLabel={trailingBadgeLabel}
      />
    </div>
  );
}

function reviewMatchesQuery(row: AllReviewsRow, q: string): boolean {
  if (!q) return true;
  const team = (row.contributor_names ?? []).join("\0").toLowerCase();
  const hay = [row.title, row.project_name, row.client_name ?? "", team]
    .join("\0")
    .toLowerCase();
  return hay.includes(q);
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

  const handleNewReview = () => {
    openNewReview({ mode: "global" });
  };

  const totalCount = useMemo(
    () =>
      grouped.compare.length +
      grouped.approve.length +
      grouped.critique.length +
      grouped.align.length,
    [grouped]
  );
  const [openState, setOpenState] = useState<Record<SectionKey, boolean>>({
    compare: totalCount > 0,
    approve: false,
    critique: false,
    align: false
  });
  const [expandedState, setExpandedState] = useState<Record<SectionKey, boolean>>({
    compare: false,
    approve: false,
    critique: false,
    align: false
  });

  const filteredGrouped = useMemo((): AllReviewsGroupedByType => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return grouped;
    const filterRows = (rows: AllReviewsRow[]) =>
      rows.filter((r) => reviewMatchesQuery(r, q));
    return {
      compare: filterRows(grouped.compare),
      approve: filterRows(grouped.approve),
      critique: filterRows(grouped.critique),
      align: filterRows(grouped.align)
    };
  }, [grouped, searchQuery]);

  useEffect(() => {
    if (searchQuery.trim() !== "") return;
    const total =
      grouped.compare.length +
      grouped.approve.length +
      grouped.critique.length +
      grouped.align.length;
    setOpenState({
      compare: total > 0,
      approve: false,
      critique: false,
      align: false
    });
    setExpandedState({
      compare: false,
      approve: false,
      critique: false,
      align: false
    });
  }, [searchQuery, grouped]);

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
        <div className="mb-8 flex flex-wrap items-baseline gap-x-6 gap-y-4">
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
        </div>

        <div className="flex flex-col">
          {SECTIONS.map((section) => {
            const rows = filteredGrouped[section.key];
            const hasSearch = searchQuery.trim() !== "";
            if (hasSearch && rows.length === 0) return null;

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
                    onToggle={() =>
                      setOpenState((prev) => ({
                        ...prev,
                        [section.key]: !prev[section.key]
                      }))
                    }
                  />
                </div>

                {open ? (
                  <div className="pb-6">
                    {rows.length === 0 ? (
                      <p
                        className="m-0 text-[13px] font-normal leading-[1.5]"
                        style={{ color: "#6b5e55" }}
                      >
                        No {section.title.toLowerCase()} reviews yet.
                      </p>
                    ) : (
                      <>
                        <SectionTypeAlert
                          description={section.description}
                          trailingBadgeLabel={section.trailingBadgeLabel}
                        />
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                          {visibleRows.map((review) => (
                            <ReviewCard
                              key={review.id}
                              title={review.title}
                              status={toReviewStatus(review.status)}
                              decisionStatus={review.decision_status}
                              requireDecisionMaker={review.require_decision_maker}
                              creatorName={
                                review.owner_display_name?.trim() ||
                                undefined
                              }
                              dateLabel={review.updated_ago}
                              clientName={review.client_name ?? undefined}
                              showDescription={false}
                              showDetailCounts
                              commentCount={undefined}
                              decisionCount={review.decision_count}
                              onClick={() => router.push(`/reviews/${review.id}`)}
                            />
                          ))}
                        </div>
                        {showToggle ? (
                          <div className="pt-4">
                            <ShowAccordion
                              state={expanded ? "less" : "more"}
                              onClick={() =>
                                setExpandedState((prev) => ({
                                  ...prev,
                                  [section.key]: !prev[section.key]
                                }))
                              }
                            />
                          </div>
                        ) : null}
                      </>
                    )}
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
