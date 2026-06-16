"use client";

import Link from "next/link";
import { ReviewCard, type ReviewStatus } from "@/components/ui/ds";
import { parseReviewDbStatus } from "@/lib/reviews/reviewStatusDisplay";

export type ReviewListItem = {
  id: string;
  title: string;
  status: string;
  decisionStatus: string | null;
  requireDecisionMaker: boolean;
  ownerDisplayName: string;
  createdAt: string;
  dateLabel: string;
  projectName: string;
};

export type ReviewGroup = {
  projectName: string;
  reviews: ReviewListItem[];
};

function normStatus(raw: string): ReviewStatus {
  return parseReviewDbStatus(raw) as ReviewStatus;
}

export function AllReviewsGrouped({
  groups,
}: {
  groups: ReviewGroup[];
}) {
  if (groups.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center px-8 py-20 text-center"
        style={{ minHeight: 320 }}
      >
        <p className="m-0 text-[15px] font-normal leading-relaxed" style={{ color: "#6b5e55" }}>
          No reviews yet — create your first review from a project page
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-10 px-8 py-8" style={{ maxWidth: 960 }}>
      {groups.map((group) => (
        <section key={group.projectName} className="flex flex-col gap-4">
          <h2
            className="m-0 text-[13px] font-semibold uppercase tracking-wide"
            style={{ color: "#998c82", letterSpacing: "0.08em" }}
          >
            {group.projectName}
          </h2>
          <div className="flex flex-col gap-3">
            {group.reviews.map((r) => (
              <Link
                key={r.id}
                href={`/reviews/${r.id}`}
                className="block rounded-lg no-underline text-inherit focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
                style={{ color: "inherit" }}
              >
                <ReviewCard
                  title={r.title}
                  status={normStatus(r.status)}
                  decisionStatus={r.decisionStatus}
                  requireDecisionMaker={r.requireDecisionMaker}
                  ownerName={r.ownerDisplayName}
                  dateLabel={r.dateLabel}
                  showDescription={false}
                  hasArtifact={false}
                  showDetailCounts={false}
                />
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
