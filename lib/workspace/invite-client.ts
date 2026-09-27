import type {
  InviteApiResponse,
  InviteDetails,
  InviteDetailsError,
  InviteDetailsResult,
  InviteErrorReason,
} from "@/types/invites";

export type { InviteErrorReason };

const FALLBACK_WORKSPACE_LABEL = "your team";

function knownWorkspaceName(raw: string | null | undefined): string | null {
  const name = String(raw ?? "").trim();
  if (!name || name.toLowerCase() === FALLBACK_WORKSPACE_LABEL) return null;
  return name;
}

export function inviteErrorAlertCopy(
  reason: InviteErrorReason,
  workspaceName: string | null,
): { title: string; body: string; linkText?: string } {
  const workspace = knownWorkspaceName(workspaceName);

  if (reason === "expired") {
    return {
      title: workspace
        ? `This invite to ${workspace} has expired.`
        : "This invite has expired.",
      body: workspace
        ? `Ask the ${workspace} workspace admin to send a new invite.`
        : "Ask your workspace admin to send a new invite.",
    };
  }

  if (reason === "accepted") {
    return {
      title: workspace
        ? `This invite to ${workspace} has already been used.`
        : "This invite has already been used.",
      body: "Sign in to continue.",
      linkText: "Sign in",
    };
  }

  return {
    title: "This invite link isn't valid.",
    body: workspace
      ? `Ask the ${workspace} workspace admin to re-send it.`
      : "Ask your workspace admin to re-send it.",
  };
}

export async function sendWorkspaceInvite(payload: {
  workspace_id: string;
  email: string;
  name?: string;
  role?: string;
  permission_level?: string;
}): Promise<InviteApiResponse> {
  const response = await fetch("/api/workspace/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const data = (await response.json()) as InviteApiResponse;
  if (!response.ok && data.status !== "error") {
    return { status: "error", message: "Could not send invite." };
  }
  return data;
}

export async function fetchInviteDetails(
  inviteCode: string,
): Promise<InviteDetailsResult> {
  const trimmed = inviteCode.trim();
  if (!trimmed) {
    return { ok: false, reason: "not_found", workspaceName: null };
  }

  const response = await fetch(
    `/api/workspace/invite/details?invite_code=${encodeURIComponent(trimmed)}`,
  );
  const data = (await response.json().catch(() => null)) as
    | InviteDetails
    | InviteDetailsError
    | null;

  if (response.ok && data && "workspace_name" in data && !("error" in data)) {
    return { ok: true, details: data as InviteDetails };
  }

  const error = data && "error" in data ? data.error : "not_found";
  const reason: InviteErrorReason =
    error === "expired" || error === "accepted" || error === "not_found"
      ? error
      : "not_found";
  const workspaceName =
    data && "workspace_name" in data
      ? String(data.workspace_name ?? "").trim() || null
      : null;
  return { ok: false, reason, workspaceName };
}

export async function joinWorkspaceByCode(input: {
  invite_code?: string;
  workspace_id?: string;
}): Promise<{
  success: boolean;
  workspace_id?: string;
  workspace_name?: string;
  permission_level?: "admin" | "editor" | "reviewer";
  already_member?: boolean;
  message?: string;
}> {
  const response = await fetch("/api/workspace/join", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  const data = (await response.json()) as {
    success?: boolean;
    workspace_id?: string;
    workspace_name?: string;
    permission_level?: "admin" | "editor" | "reviewer";
    already_member?: boolean;
    message?: string;
  };

  if (!response.ok) {
    return { success: false, message: data.message ?? "Could not join workspace." };
  }

  return {
    success: Boolean(data.success),
    workspace_id: data.workspace_id,
    workspace_name: data.workspace_name,
    permission_level: data.permission_level,
    already_member: data.already_member,
    message: data.message,
  };
}

export async function acceptWorkspaceInvite(inviteCode: string): Promise<{
  success: boolean;
  workspace_id?: string;
  message?: string;
  error?: InviteErrorReason;
  workspaceName?: string | null;
}> {
  const response = await fetch("/api/workspace/invite/accept", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invite_code: inviteCode }),
  });

  const data = (await response.json()) as {
    success?: boolean;
    workspace_id?: string;
    message?: string;
    error?: InviteErrorReason;
    workspace_name?: string | null;
  };

  if (!response.ok) {
    const error: InviteErrorReason =
      data.error === "expired" || data.error === "accepted" || data.error === "not_found"
        ? data.error
        : "not_found";
    return {
      success: false,
      message: data.message ?? "Could not accept invite.",
      error,
      workspaceName: data.workspace_name ?? null,
    };
  }

  return {
    success: Boolean(data.success),
    workspace_id: data.workspace_id,
    message: data.message,
  };
}

export async function cancelWorkspaceInvite(inviteCode: string): Promise<{
  success: boolean;
  message?: string;
}> {
  const response = await fetch("/api/workspace/invite/cancel", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ invite_code: inviteCode }),
  });

  const data = (await response.json()) as { success?: boolean; message?: string };

  if (!response.ok) {
    return { success: false, message: data.message ?? "Could not cancel invite." };
  }

  return { success: Boolean(data.success), message: data.message };
}

export const INVITE_CODE_STORAGE_KEY = "dt_invite_code";
