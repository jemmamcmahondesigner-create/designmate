"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Tag } from "@/components/ui/ds";
import { useToast } from "@/components/Toast";

export type FigmaConnectionInfo = {
  connectedByName: string;
  connectedAt: string;
} | null;

function FigmaLogo() {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 38 57"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M19 28.5C19 23.2533 23.2533 19 28.5 19C33.7467 19 38 23.2533 38 28.5C38 33.7467 33.7467 38 28.5 38C23.2533 38 19 33.7467 19 28.5Z"
        fill="currentColor"
      />
      <path
        d="M0 47.5C0 42.2533 4.25329 38 9.5 38H19V47.5C19 52.7467 14.7467 57 9.5 57C4.25329 57 0 52.7467 0 47.5Z"
        fill="currentColor"
      />
      <path
        d="M19 0V19H28.5C33.7467 19 38 14.7467 38 9.5C38 4.25329 33.7467 0 28.5 0H19Z"
        fill="currentColor"
      />
      <path
        d="M0 9.5C0 14.7467 4.25329 19 9.5 19H19V0H9.5C4.25329 0 0 4.25329 0 9.5Z"
        fill="currentColor"
      />
      <path
        d="M0 28.5C0 33.7467 4.25329 38 9.5 38H19V19H9.5C4.25329 19 0 23.2533 0 28.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

function formatConnectedDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

export function IntegrationsSettingsPage({
  isAdmin,
  figmaConnection,
  figmaStatus,
}: {
  isAdmin: boolean;
  figmaConnection: FigmaConnectionInfo;
  figmaStatus: "connected" | "error" | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [connection, setConnection] = useState(figmaConnection);
  const [disconnecting, setDisconnecting] = useState(false);

  useEffect(() => {
    if (!figmaStatus) return;

    if (figmaStatus === "connected") {
      showToast("Figma connected successfully");
    } else {
      showToast({
        message: "Figma connection failed. Please try again.",
        sentiment: "danger",
      });
    }

    router.replace("/settings", { scroll: false });
  }, [figmaStatus, router, showToast]);

  async function handleDisconnect() {
    setDisconnecting(true);
    try {
      const res = await fetch("/api/auth/figma/disconnect", { method: "DELETE" });
      if (!res.ok) {
        showToast({
          message: "Could not disconnect Figma. Please try again.",
          sentiment: "danger",
        });
        return;
      }
      setConnection(null);
      showToast("Figma disconnected");
      router.refresh();
    } catch {
      showToast({
        message: "Could not disconnect Figma. Please try again.",
        sentiment: "danger",
      });
    } finally {
      setDisconnecting(false);
    }
  }

  const connected = connection != null;

  return (
    <>
      <h1
        style={{
          margin: 0,
          fontSize: 32,
          fontWeight: 800,
          color: "var(--text-heading, #6b1e2e)",
        }}
      >
        Integrations
      </h1>
      <p
        style={{
          margin: "8px 0 0",
          fontSize: 14,
          lineHeight: 1.5,
          color: "var(--text-secondary, #6b5e55)",
          maxWidth: 560,
        }}
      >
        Connect tools to automate workspace workflows.
      </p>

      <section style={{ marginTop: 32, maxWidth: 560 }}>
        <div
          style={{
            border: "1px solid var(--border-subtle, #ede8e0)",
            borderRadius: 12,
            background: "var(--surface-card, #ffffff)",
            padding: 20,
            display: "flex",
            flexDirection: "column",
            gap: 12,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <span
              style={{
                display: "inline-flex",
                color: "var(--text-heading, #29211c)",
              }}
            >
              <FigmaLogo />
            </span>
            <h2
              style={{
                margin: 0,
                fontSize: 18,
                fontWeight: 700,
                color: "var(--text-heading, #29211c)",
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}
            >
              Figma
            </h2>
            {connected ? (
              <Tag label="Connected" variant="success" size="sm" />
            ) : null}
          </div>

          {connected ? (
            <>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: "var(--text-secondary, #6b5e55)",
                }}
              >
                Snapshots will be captured automatically when reviews are approved
                or completed.
              </p>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: "var(--text-tertiary, #998c82)",
                }}
              >
                Connected by {connection.connectedByName} on{" "}
                {formatConnectedDate(connection.connectedAt)}
              </p>
              {isAdmin ? (
                <div style={{ marginTop: 4 }}>
                  <Button
                    label={disconnecting ? "Disconnecting…" : "Disconnect"}
                    variant="destructive"
                    size="sm"
                    disabled={disconnecting}
                    onClick={() => void handleDisconnect()}
                  />
                </div>
              ) : null}
            </>
          ) : (
            <>
              <p
                style={{
                  margin: 0,
                  fontSize: 14,
                  lineHeight: 1.5,
                  color: "var(--text-secondary, #6b5e55)",
                }}
              >
                {isAdmin
                  ? "Connect a Figma account to enable automatic design snapshots when reviews are resolved."
                  : "Ask your workspace admin to connect Figma."}
              </p>
              {isAdmin ? (
                <div style={{ marginTop: 4 }}>
                  <Button
                    label="Connect Figma"
                    variant="primary"
                    size="sm"
                    onClick={() => {
                      window.location.href = "/api/auth/figma";
                    }}
                  />
                </div>
              ) : null}
            </>
          )}
        </div>
      </section>
    </>
  );
}
