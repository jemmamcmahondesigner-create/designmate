import type { InviteApiResponse, InviteDetails } from "@/types/invites";

export async function sendWorkspaceInvite(payload: {
  workspace_id: string;
  email: string;
  name?: string;
  role?: string;
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

export async function fetchInviteDetails(inviteCode: string): Promise<InviteDetails | null> {
  const response = await fetch(
    `/api/workspace/invite/details?invite_code=${encodeURIComponent(inviteCode)}`,
  );
  if (!response.ok) return null;
  return (await response.json()) as InviteDetails;
}

export async function acceptWorkspaceInvite(inviteCode: string): Promise<{
  success: boolean;
  workspace_id?: string;
  message?: string;
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
  };

  if (!response.ok) {
    return { success: false, message: data.message ?? "Could not accept invite." };
  }

  return {
    success: Boolean(data.success),
    workspace_id: data.workspace_id,
    message: data.message,
  };
}

export const INVITE_CODE_STORAGE_KEY = "dt_invite_code";
