"use client";

import { Alert, Button } from "@/components/ui/ds";

export function SubscriptionSettingsPage({ editorCount }: { editorCount: number }) {
  return (
    <>
      <h1 style={{ margin: 0, fontSize: 32, fontWeight: 800, color: "var(--text-heading, #6b1e2e)" }}>Subscription</h1>
      <div style={{ marginTop: 16 }}>
        <Alert
          sentiment="base"
          prominence="low"
          title="Subscription management will be available in an upcoming release."
          dismissible={false}
        />
      </div>
      <div
        style={{
          marginTop: 24,
          background: "var(--surface-card-default, #ffffff)",
          border: "1px solid var(--border-default, #e4ddd3)",
          borderRadius: 8,
          padding: 24,
          display: "flex",
          flexDirection: "column",
          gap: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 14, color: "var(--text-secondary, #6b5e55)" }}>Current plan</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary, #2e1c1c)" }}>Pro — Active</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 14, color: "var(--text-secondary, #6b5e55)" }}>Workspace editors</span>
          <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary, #2e1c1c)" }}>{editorCount}</span>
        </div>
        <div style={{ height: 1, background: "var(--border-subtle, #ede8e0)" }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <Button label="Manage subscription" variant="secondary" size="sm" disabled />
          <p style={{ margin: 0, fontSize: 13, fontWeight: 400, color: "var(--text-tertiary, #998c82)" }}>
            Billing integration coming soon
          </p>
        </div>
      </div>
    </>
  );
}
