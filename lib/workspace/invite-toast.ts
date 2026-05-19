import type { InviteApiResponse } from "@/types/invites";

export function inviteToastMessage(
  result: InviteApiResponse,
  fallbackName: string,
  fallbackEmail: string,
): string {
  switch (result.status) {
    case "invited":
      return `Invite sent to ${fallbackEmail}`;
    case "added":
      return `Added ${fallbackName} to the workspace`;
    case "already_member":
      return `${fallbackName} is already in this workspace`;
    case "error":
      return result.message;
    default:
      return "Could not process invite.";
  }
}
