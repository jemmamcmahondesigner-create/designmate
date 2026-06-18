import Link from "next/link";
import { Avatar, StatusPill, Tag, Tooltip, type StatusPillStatus } from "@/components/ui/ds";
import { getAvatarInlineStyle, avatarColourKey } from "@/lib/utils/avatarColour";
import type { Project, ProjectStatus } from "@/types/project";

const MAX_VISIBLE_TEAMMATES = 5;

function projectStatusToPill(
  status: ProjectStatus
): { status: StatusPillStatus; label: string } {
  switch (status) {
    case "active":
      return { status: "approved", label: "Active" };
    case "paused":
      return { status: "draft", label: "Paused" };
    case "complete":
      return { status: "closed", label: "Complete" };
    default:
      return { status: "draft", label: "Paused" };
  }
}

export type ProjectCardProps = {
  project: Project;
  reviewCount?: number;
};

export function ProjectCard({
  project,
  reviewCount = 0,
}: ProjectCardProps) {
  const displayClient = project.client?.trim() || null;

  const descriptionText = project.description?.trim() ?? "";
  const statusPill = projectStatusToPill(project.status);
  const visibleContributors = project.contributors.slice(0, MAX_VISIBLE_TEAMMATES);
  const overflowCount = Math.max(
    0,
    project.contributors.length - MAX_VISIBLE_TEAMMATES
  );
  const teammateTooltipLabel = project.contributors.map((c) => c.name).join("\n");

  return (
    <Link
      href={`/projects/${project.id}`}
      className="block w-full no-underline"
    >
      <article
        className="w-full cursor-pointer border border-solid border-[#e4ddd3] shadow-[0px_1px_3px_rgba(41,33,28,0.08)] hover:border-[#c9c0b4] hover:shadow-[0px_4px_12px_rgba(41,33,28,0.12)]"
        style={{
          backgroundColor: "#ffffff",
          borderRadius: 8,
          padding: 20,
          transition: "all 150ms ease"
        }}
      >
        <div className="flex flex-col" style={{ gap: 12 }}>
          <h3
            className="text-[16px] font-semibold leading-[1.5]"
            style={{ color: "#2e1c1c", letterSpacing: "0.2px" }}
          >
            {project.name}
          </h3>
          <div
            className="flex flex-wrap items-center text-[12px] font-normal leading-[1.5]"
            style={{ color: "#6b5e55", gap: 12, letterSpacing: "0.24px" }}
          >
            <StatusPill
              label={statusPill.label}
              status={statusPill.status}
              size="sm"
              prominence="high"
            />
            {project.contributors.length > 0 ? (
              <Tooltip
                label={teammateTooltipLabel}
                position="top"
                maxWidth={320}
              >
                <span
                  className="inline-flex items-center"
                  aria-label={`${project.contributors.length} teammates`}
                >
                  {visibleContributors.map((contributor, index) => {
                    const colourKey = avatarColourKey(
                      contributor.email,
                      contributor.id,
                      contributor.name,
                    );
                    return (
                    <span
                      key={contributor.id}
                      className="inline-flex rounded-full border border-solid border-white"
                      style={{
                        marginRight:
                          index < visibleContributors.length - 1 ||
                          overflowCount > 0
                            ? -4
                            : 0,
                        zIndex: visibleContributors.length - index,
                      }}
                    >
                      <Avatar
                        name={contributor.name}
                        contributorId={colourKey}
                        src={contributor.avatarUrl ?? undefined}
                        size="md"
                        style={getAvatarInlineStyle(colourKey)}
                      />
                    </span>
                    );
                  })}
                  {overflowCount > 0 ? (
                    <span
                      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-solid border-white text-[10px] font-semibold leading-none tracking-[0.2px]"
                      style={{
                        marginRight: 0,
                        zIndex: 0,
                        backgroundColor: "#f7eff2",
                        color: "#7a2b3a",
                      }}
                      aria-hidden
                    >
                      +{overflowCount}
                    </span>
                  ) : null}
                </span>
              </Tooltip>
            ) : null}
            <span>
              {reviewCount} {reviewCount === 1 ? "review" : "reviews"}
            </span>
          </div>
          {descriptionText ? (
            <p
              className="line-clamp-2 overflow-hidden text-ellipsis text-[13px] font-normal leading-[1.5]"
              style={{
                color: "#6b5e55",
                minHeight: 39,
                maxHeight: 39,
                letterSpacing: "0.26px"
              }}
            >
              {descriptionText}
            </p>
          ) : null}
          {displayClient ? (
            <div className="flex items-center pt-1">
              <Tag label={displayClient} variant="mushroom" size="sm" />
            </div>
          ) : null}
        </div>
      </article>
    </Link>
  );
}
