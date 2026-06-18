"use client";

import { Alert } from "@/components/ui/ds";

export function SubscriptionSettingsPage() {
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
    </>
  );
}
