import type { InviteApiResponse } from "@/types/invites";
import type { ToastShowOptions } from "@/components/Toast";

export function inviteToastMessage(
  result: InviteApiResponse,
  fallbackName: string,
  fallbackEmail: string,
): string | ToastShowOptions {
  switch (result.status) {
    case "invited":
      return `Invite sent to ${fallbackEmail}`;
    case "added":
      return `Added ${fallbackName} to the workspace`;
    case "already_member":
      return `${fallbackName} is already in this workspace`;
    case "error":
      return {
        message: result.message,
        sentiment: "danger",
      };
    default:
      return {
        message: "Could not process invite.",
        sentiment: "danger",
      };
  }
}
