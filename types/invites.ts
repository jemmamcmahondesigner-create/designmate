export type WorkspaceInvite = {
  id: string;
  workspace_id: string;
  email: string;
  role: string;
  invited_by: string | null;
  invite_code: string;
  status: "pending" | "accepted" | "expired";
  created_at: string;
  expires_at: string;
};

export type InviteApiResponse =
  | { status: "invited" }
  | { status: "added"; user_id: string }
  | { status: "already_member" }
  | { status: "error"; message: string };

export type InviteDetails = {
  workspace_name: string;
  inviter_name: string;
  role: string;
  expires_at: string;
};
