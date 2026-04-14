import Link from "next/link";
import type { Project, ProjectStatus } from "@/types/project";

const CLIENT_OPTIONS = [
  "Internal Project",
  "Gem Designs and Signs",
  "Peak Digital Solutions",
  "Creative Canvas Marketing"
] as const;

function clientTagStyles(client: string | null): {
  bg: string;
  border: string;
  text: string;
} {
  const c = client?.trim() ?? null;
  switch (c) {
    case "Internal Project":
      return { bg: "#f5e8f6", border: "#d9a8dc", text: "#7a3f8a" };
    case "Gem Designs and Signs":
      return { bg: "#fff6d7", border: "#fff0a3", text: "#7a5500" };
    case "Peak Digital Solutions":
      return { bg: "#ede8e0", border: "#c9c0b4", text: "#6b5e55" };
    case "Creative Canvas Marketing":
      return { bg: "#ebf7f4", border: "#a8d9d0", text: "#256b38" };
    default:
      return { bg: "#f3efe9", border: "#e4ddd3", text: "#6b5e55" };
  }
}

function StatusPill({ status }: { status: ProjectStatus }) {
  const base =
    "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase leading-[1.5] text-white";
  const overlineStyle = { letterSpacing: "1px" as const };
  if (status === "active") {
    return (
      <span
        className={base}
        style={{ backgroundColor: "#3b9b54", ...overlineStyle }}
      >
        Active
      </span>
    );
  }
  if (status === "paused") {
    return (
      <span
        className={base}
        style={{ backgroundColor: "#b8b0a8", ...overlineStyle }}
      >
        Paused
      </span>
    );
  }
  return (
    <span
      className={base}
      style={{ backgroundColor: "#7e7269", ...overlineStyle }}
    >
      Complete
    </span>
  );
}

export type ProjectCardProps = {
  project: Project;
  reviewCount?: number;
  decisionCount?: number;
};

export function ProjectCard({
  project,
  reviewCount = 0,
  decisionCount = 0
}: ProjectCardProps) {
  const clientTrimmed = project.client?.trim() ?? null;
  const tag = clientTagStyles(clientTrimmed);
  const displayClient =
    clientTrimmed &&
    CLIENT_OPTIONS.includes(clientTrimmed as (typeof CLIENT_OPTIONS)[number])
      ? clientTrimmed
      : clientTrimmed ?? "Unassigned";

  const descriptionText = project.description?.trim() ?? "";

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
            className="text-[18px] font-semibold leading-[1.5]"
            style={{ color: "#2e1c1c" }}
          >
            {project.name}
          </h3>
          <div
            className="flex flex-wrap items-center text-[12px] font-normal leading-[1.5]"
            style={{ color: "#6b5e55", gap: 16, letterSpacing: "0.24px" }}
          >
            <StatusPill status={project.status} />
            <span>{reviewCount} reviews</span>
            <span>{decisionCount} decisions</span>
          </div>
          {descriptionText ? (
            <p
              className="line-clamp-2 overflow-hidden text-ellipsis text-[12px] font-normal leading-[1.5]"
              style={{
                color: "#6b5e55",
                minHeight: 40,
                maxHeight: 40,
                letterSpacing: "0.24px"
              }}
            >
              {descriptionText}
            </p>
          ) : null}
          <div className="flex items-center pt-1">
            <span
              className="inline-block max-w-full truncate rounded-[4px] border border-solid px-2 py-0.5 text-[12px] font-normal leading-[1.5]"
              style={{
                backgroundColor: tag.bg,
                borderColor: tag.border,
                color: tag.text,
                letterSpacing: "0.24px"
              }}
            >
              {displayClient}
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}
