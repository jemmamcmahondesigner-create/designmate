"use client";

import { Alert, Icon, Table, type ColumnDef } from "@/components/ui/ds";

type PermRow = { id: string; feature: string; owner: boolean; editor: boolean; reviewer: boolean };

const ROWS: PermRow[] = [
  { id: "1", feature: "Create reviews", owner: true, editor: true, reviewer: false },
  { id: "2", feature: "Edit any review", owner: true, editor: false, reviewer: false },
  { id: "3", feature: "Edit own reviews", owner: true, editor: true, reviewer: false },
  { id: "4", feature: "Submit feedback", owner: true, editor: true, reviewer: true },
  { id: "5", feature: "Manage teammates", owner: true, editor: false, reviewer: false },
  { id: "6", feature: "Access settings", owner: true, editor: false, reviewer: false },
  { id: "7", feature: "Billing", owner: true, editor: false, reviewer: false },
];

const checkColor = "var(--workflow-approved-text)";
const dashColor = "var(--text-tertiary, #998c82)";

function CellMark({ on }: { on: boolean }) {
  return on ? (
    <Icon name="check" size={16} style={{ color: checkColor }} aria-label="Yes" />
  ) : (
    <span style={{ color: dashColor, fontSize: 14 }} aria-hidden>
      —
    </span>
  );
}

export function PermissionsSettingsPage() {
  const columns: ColumnDef<PermRow>[] = [
    {
      key: "feature",
      label: "Feature",
      width: "flex",
      cellType: "text-bold",
      render: (row) => row.feature,
    },
    {
      key: "owner",
      label: "Owner",
      width: 120,
      cellType: "custom",
      align: "center",
      render: (row) => <CellMark on={row.owner} />,
    },
    {
      key: "editor",
      label: "Editor",
      width: 120,
      cellType: "custom",
      align: "center",
      render: (row) => <CellMark on={row.editor} />,
    },
    {
      key: "reviewer",
      label: "Reviewer",
      width: 120,
      cellType: "custom",
      align: "center",
      render: (row) => <CellMark on={row.reviewer} />,
    },
  ];

  return (
    <>
      <div style={{ marginBottom: 8 }}>
        <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: "var(--text-heading, #6b1e2e)" }}>Permissions</h1>
      </div>
      <div style={{ marginBottom: 16 }}>
        <Alert
          sentiment="base"
          prominence="low"
          title="Permission enforcement is coming soon — these levels are set up and ready but not yet enforced in the product."
          dismissible={false}
        />
      </div>
      <Table columns={columns} rows={ROWS} />
    </>
  );
}
