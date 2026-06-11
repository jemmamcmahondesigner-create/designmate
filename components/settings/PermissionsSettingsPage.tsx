"use client";

import { Icon, Table, Tooltip, type ColumnDef, type IconName } from "@/components/ui/ds";
import settingsTableLayoutStyles from "./settingsTableLayout.module.css";
import permissionsTableStyles from "./PermissionsSettingsPage.module.css";

type CellValue = boolean | { italic: string };

type PermRow =
  | { id: string; type: "section"; title: string }
  | {
      id: string;
      type: "permission";
      permission: string;
      description?: string;
      admin: CellValue;
      editor: CellValue;
      reviewer: CellValue;
    };

const checkColor = "var(--workflow-approved-text)";
const dashColor = "var(--text-tertiary, #998c82)";

const descriptionStyle: React.CSSProperties = {
  fontSize: 13,
  color: "var(--text-secondary, #6b5e55)",
  lineHeight: 1.5,
};

const italic = (text: string): CellValue => ({ italic: text });

const SECTION_HEADING_COLOR = "var(--text-heading, #6b1e2e)";

const SECTION_ICONS: Record<string, IconName> = {
  "section-workspace": "nav-settings",
  "section-projects": "nav-archive",
  "section-reviews": "nav-reviews",
  "section-feedback": "decisions",
  "section-teammates": "contributor",
  "section-groups": "link",
  "section-settings": "nav-settings",
};

function renderSectionHeading(row: Extract<PermRow, { type: "section" }>) {
  const iconName = SECTION_ICONS[row.id];
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {iconName ? (
        <Icon name={iconName} size={16} style={{ color: SECTION_HEADING_COLOR }} />
      ) : null}
      <span
        style={{
          fontSize: 16,
          fontWeight: 600,
          color: SECTION_HEADING_COLOR,
        }}
      >
        {row.title}
      </span>
    </div>
  );
}

const ROWS: PermRow[] = [
  { id: "section-workspace", type: "section", title: "Workspace roles" },
  {
    id: "perm-admin-flag",
    type: "permission",
    permission: "Admin flag",
    description: "Admin is a flag applied to any content role. At least one Admin must always exist.",
    admin: true,
    editor: italic("+ Admin"),
    reviewer: italic("+ Admin"),
  },
  { id: "section-projects", type: "section", title: "Projects" },
  {
    id: "perm-view-projects",
    type: "permission",
    permission: "View all projects in workspace",
    description: "Reviewers only see projects they have been explicitly added to.",
    admin: true,
    editor: true,
    reviewer: italic("Own only"),
  },
  {
    id: "perm-create-project",
    type: "permission",
    permission: "Create a project",
    admin: true,
    editor: true,
    reviewer: false,
  },
  {
    id: "perm-edit-project",
    type: "permission",
    permission: "Edit project details",
    description: "Editors must be added to the project by an Admin or the project creator.",
    admin: true,
    editor: italic("Added"),
    reviewer: false,
  },
  {
    id: "perm-delete-project",
    type: "permission",
    permission: "Delete a project",
    description: "Editors can only delete projects they created.",
    admin: true,
    editor: italic("Own only"),
    reviewer: false,
  },
  {
    id: "perm-project-teammates",
    type: "permission",
    permission: "Add / remove teammates from a project",
    description: "Once added to a project, Editors can add other teammates to it.",
    admin: true,
    editor: italic("Added"),
    reviewer: false,
  },
  {
    id: "perm-link-group",
    type: "permission",
    permission: "Link a group to a project",
    admin: true,
    editor: italic("Added"),
    reviewer: false,
  },
  { id: "section-reviews", type: "section", title: "Reviews" },
  {
    id: "perm-create-review",
    type: "permission",
    permission: "Create a review",
    admin: true,
    editor: true,
    reviewer: false,
  },
  {
    id: "perm-edit-own-review",
    type: "permission",
    permission: "Edit own review",
    admin: true,
    editor: true,
    reviewer: false,
  },
  {
    id: "perm-edit-any-review",
    type: "permission",
    permission: "Edit any review in a project",
    description: "Editors must be added to the project to edit any of its reviews.",
    admin: true,
    editor: italic("Added"),
    reviewer: false,
  },
  {
    id: "perm-delete-review",
    type: "permission",
    permission: "Delete a review",
    admin: true,
    editor: italic("Own only"),
    reviewer: false,
  },
  {
    id: "perm-add-reviewers",
    type: "permission",
    permission: "Add reviewers to a review",
    description: "Reviewers must already have access to the project.",
    admin: true,
    editor: italic("Added"),
    reviewer: false,
  },
  {
    id: "perm-request-edit-access",
    type: "permission",
    permission: "Request edit access to a review",
    description: "An Admin or project creator approves the request.",
    admin: false,
    editor: true,
    reviewer: false,
  },
  { id: "section-feedback", type: "section", title: "Feedback & decisions" },
  {
    id: "perm-submit-feedback",
    type: "permission",
    permission: "Submit feedback on a review",
    admin: true,
    editor: true,
    reviewer: true,
  },
  {
    id: "perm-submit-on-behalf",
    type: "permission",
    permission: "Submit feedback on behalf of a reviewer",
    description: "Admin only — for async or delegated feedback scenarios.",
    admin: true,
    editor: false,
    reviewer: false,
  },
  {
    id: "perm-final-decision",
    type: "permission",
    permission: "Make a final decision (Compare reviews)",
    description:
      "The first assigned reviewer is the Decision Maker by default. Creator or Admin can reassign via Edit Review.",
    admin: true,
    editor: false,
    reviewer: false,
  },
  {
    id: "perm-log-decision",
    type: "permission",
    permission: "Log a decision (Decision Log)",
    description: "Available on Approve and Compare review types only.",
    admin: true,
    editor: italic("Added"),
    reviewer: false,
  },
  { id: "section-teammates", type: "section", title: "Teammates & workspace members" },
  {
    id: "perm-invite-teammate",
    type: "permission",
    permission: "Invite a teammate",
    admin: true,
    editor: true,
    reviewer: false,
  },
  {
    id: "perm-remove-teammate",
    type: "permission",
    permission: "Remove a teammate",
    admin: true,
    editor: false,
    reviewer: false,
  },
  {
    id: "perm-assign-role",
    type: "permission",
    permission: "Assign / change content role (Editor / Reviewer)",
    admin: true,
    editor: false,
    reviewer: false,
  },
  {
    id: "perm-assign-admin",
    type: "permission",
    permission: "Assign / remove Admin flag",
    admin: true,
    editor: false,
    reviewer: false,
  },
  {
    id: "perm-view-teammates",
    type: "permission",
    permission: "View all teammates",
    admin: true,
    editor: true,
    reviewer: true,
  },
  { id: "section-groups", type: "section", title: "Groups" },
  {
    id: "perm-view-groups",
    type: "permission",
    permission: "View groups",
    admin: true,
    editor: true,
    reviewer: true,
  },
  {
    id: "perm-create-group",
    type: "permission",
    permission: "Create a group",
    admin: true,
    editor: true,
    reviewer: false,
  },
  {
    id: "perm-edit-group",
    type: "permission",
    permission: "Edit a group",
    description: "Editors can only edit groups they created.",
    admin: true,
    editor: italic("Own only"),
    reviewer: false,
  },
  {
    id: "perm-delete-group",
    type: "permission",
    permission: "Delete a group",
    admin: true,
    editor: false,
    reviewer: false,
  },
  { id: "section-settings", type: "section", title: "Settings" },
  {
    id: "perm-view-settings",
    type: "permission",
    permission: "View teammates, roles, permissions, groups",
    description: "Reviewers have view-only access to these pages.",
    admin: true,
    editor: true,
    reviewer: true,
  },
  {
    id: "perm-edit-workspace",
    type: "permission",
    permission: "Edit workspace settings",
    admin: true,
    editor: true,
    reviewer: false,
  },
  {
    id: "perm-manage-roles",
    type: "permission",
    permission: "Manage roles & permissions",
    admin: true,
    editor: false,
    reviewer: false,
  },
  {
    id: "perm-edit-profile",
    type: "permission",
    permission: "Edit own profile (My Profile)",
    description: "All workspace members can edit their own profile.",
    admin: true,
    editor: true,
    reviewer: true,
  },
  {
    id: "perm-billing",
    type: "permission",
    permission: "Manage billing / subscription",
    description: "Reviewer role is always free. Editors and Admin-flagged members hold paid seats.",
    admin: true,
    editor: false,
    reviewer: false,
  },
  {
    id: "perm-upgrade",
    type: "permission",
    permission: "Upgrade own account to paid",
    description: "Reviewers can initiate their own upgrade. Billing flow TBD.",
    admin: false,
    editor: false,
    reviewer: italic("Self only"),
  },
];

function CellMark({ on }: { on: boolean }) {
  return on ? (
    <Icon name="check" size={16} style={{ color: checkColor }} aria-label="Yes" />
  ) : (
    <span style={{ color: dashColor, fontSize: 14 }} aria-hidden>
      —
    </span>
  );
}

function renderPermissionCell(value: CellValue | undefined) {
  if (value === undefined) return null;
  if (value === true) return <CellMark on={true} />;
  if (value === false) return <CellMark on={false} />;
  return (
    <span
      style={{
        fontStyle: "italic",
        fontSize: 13,
        color: "var(--text-secondary, #6b5e55)",
      }}
    >
      {value.italic}
    </span>
  );
}

function permissionValue(row: PermRow, role: "admin" | "editor" | "reviewer"): CellValue | undefined {
  if (row.type !== "permission") return undefined;
  return row[role];
}

function renderDescription(row: PermRow) {
  if (row.type !== "permission" || !row.description) return null;
  return <span style={descriptionStyle}>{row.description}</span>;
}

export function PermissionsSettingsPage() {
  // TODO: Add a Members column (avatar chips per role) when workspace members data is available on this page.

  const columns: ColumnDef<PermRow>[] = [
    {
      key: "permission",
      label: "Permission",
      cellType: "custom",
      render: (row, _context) => {
        if (row.type === "section") {
          return renderSectionHeading(row);
        }
        return (
          <Tooltip label={row.permission}>
            <span
              style={{
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                display: "block",
                fontSize: 13,
                fontWeight: 600,
                color: "var(--text-primary, #2e1c1c)",
              }}
            >
              {row.permission}
            </span>
          </Tooltip>
        );
      },
    },
    {
      key: "description",
      label: "Description",
      width: "flex",
      cellType: "custom",
      render: (row, _context) => renderDescription(row),
    },
    {
      key: "admin",
      label: "Admin",
      width: 120,
      cellType: "custom",
      align: "center",
      render: (row, _context) => renderPermissionCell(permissionValue(row, "admin")),
    },
    {
      key: "editor",
      label: "Editor",
      width: 120,
      cellType: "custom",
      align: "center",
      render: (row, _context) => renderPermissionCell(permissionValue(row, "editor")),
    },
    {
      key: "reviewer",
      label: "Reviewer",
      width: 120,
      cellType: "custom",
      align: "center",
      render: (row, _context) => renderPermissionCell(permissionValue(row, "reviewer")),
    },
  ];

  return (
    <div className={settingsTableLayoutStyles.pageContent}>
      <div style={{ marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: "var(--text-heading, #6b1e2e)" }}>
          Permissions
        </h1>
      </div>
      <div
        className={settingsTableLayoutStyles.tableShell}
        style={{ minWidth: 0, width: "100%" }}
      >
        <div className={settingsTableLayoutStyles.tableScroll}>
          <div className={settingsTableLayoutStyles.tableScrollInner}>
            <Table
              className={`${settingsTableLayoutStyles.tableBorderless} ${permissionsTableStyles.permissionsTable}`}
              columns={columns}
              rows={ROWS}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
