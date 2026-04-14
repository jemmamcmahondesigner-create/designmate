export type ReviewCardStatus =
  | "in-review"
  | "approved"
  | "needs-changes"
  | "blocked";

export type ReviewCardData = {
  id?: string;
  title: string;
  status: ReviewCardStatus;
  ownerName: string;
  dateLabel: string;
  iterationLabel?: string;
  commentCount?: number;
  decisionCount?: number;
};

function ReviewStatusPill({ status }: { status: ReviewCardStatus }) {
  const base =
    "inline-flex items-center rounded-full px-[8px] py-[3px] text-[10px] font-semibold uppercase leading-none";
  const track = { letterSpacing: "0.5px" as const };
  switch (status) {
    case "in-review":
      return (
        <span className={base} style={{ backgroundColor: "#ffecac", color: "#7a5500", ...track }}>
          In-Review
        </span>
      );
    case "approved":
      return (
        <span className={base} style={{ backgroundColor: "#ebf6ee", color: "#256b38", ...track }}>
          Approved
        </span>
      );
    case "needs-changes":
      return (
        <span className={base} style={{ backgroundColor: "#6b1e2e", color: "#ffffff", ...track }}>
          Needs Changes
        </span>
      );
    case "blocked":
      return (
        <span className={base} style={{ backgroundColor: "#fceaea", color: "#8b2020", ...track }}>
          Blocked
        </span>
      );
    default:
      return null;
  }
}

function countLabel(n: number, singular: string, plural: string): string {
  return `${n} ${n === 1 ? singular : plural}`;
}

export function ReviewCard({ data }: { data: ReviewCardData }) {
  const needsChanges = data.status === "needs-changes";

  const showCounts =
    data.commentCount !== undefined && data.decisionCount !== undefined;

  return (
    <article
      className={[
        "cursor-pointer rounded-[8px] border border-solid shadow-[0px_1px_3px_rgba(41,33,28,0.08)] transition-all duration-150 ease-in-out hover:shadow-[0px_4px_12px_rgba(41,33,28,0.12)]",
        needsChanges
          ? "border-[#e5b025] hover:border-[#e5b025]"
          : "border-[#e4ddd3] hover:border-[#c9c0b4]"
      ].join(" ")}
      style={{
        backgroundColor: needsChanges ? "#fef8dc" : "#ffffff"
      }}
    >
      <div className="flex flex-col py-[16px] px-[20px]">
        <h3
          className="mb-2 text-[16px] font-semibold leading-[1.4]"
          style={{
            color: needsChanges ? "#7a5500" : "#2e1c1c",
            letterSpacing: "-0.16px"
          }}
        >
          {data.title}
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <ReviewStatusPill status={data.status} />
          <span
            className="text-[12px] font-medium leading-[1.5]"
            style={{ color: "#2e1c1c", letterSpacing: "0.24px" }}
          >
            {data.ownerName}
          </span>
          <span
            className="text-[12px] font-normal leading-[1.5]"
            style={{ color: "#998c82", letterSpacing: "0.24px" }}
            aria-hidden
          >
            ·
          </span>
          <span
            className="text-[12px] font-normal leading-[1.5]"
            style={{ color: "#998c82", letterSpacing: "0.24px" }}
          >
            {data.dateLabel}
          </span>
        </div>
        {data.iterationLabel ? (
          <div className="mt-2">
            <span
              className="inline-flex items-center border border-solid text-[11px] font-normal leading-[1.5]"
              style={{
                backgroundColor: "#f3efe9",
                borderColor: "#e4ddd3",
                borderRadius: 4,
                padding: "2px 8px",
                color: "#998c82"
              }}
            >
              {data.iterationLabel}
            </span>
          </div>
        ) : null}
        {showCounts ? (
          <>
            <div
              className="mt-2 w-full shrink-0 border-0 border-t border-solid border-[#ede8e0]"
            />
            <div
              className="flex flex-wrap items-center pt-[6px] text-[12px] font-normal leading-[1.5]"
              style={{
                color: "#998c82",
                letterSpacing: "0.24px",
                gap: 12
              }}
            >
              <span>{countLabel(data.commentCount!, "comment", "comments")}</span>
              <span>
                {countLabel(data.decisionCount!, "decision", "decisions")}
              </span>
            </div>
          </>
        ) : null}
      </div>
    </article>
  );
}
