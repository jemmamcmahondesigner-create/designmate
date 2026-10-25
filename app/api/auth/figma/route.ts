import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getActiveWorkspaceIdFromUser } from "@/lib/workspace/activeWorkspace";
import { resolveWorkspaceMembership } from "@/lib/workspace/resolveWorkspaceMembership";
import {
  applyFigmaOAuthCookie,
  createFigmaOAuthNonce,
  encodeFigmaOAuthState,
} from "@/lib/figma/oauthStateCookie";

function getRedirectUri(): string {
  const origin = (
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000"
  ).replace(/\/$/, "");
  return `${origin}/api/auth/figma/callback`;
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const workspaceId = getActiveWorkspaceIdFromUser(user);
  if (!workspaceId) {
    return NextResponse.json(
      { error: "No active_workspace_id found." },
      { status: 400 },
    );
  }

  const membership = await resolveWorkspaceMembership(supabase, workspaceId);
  if (membership.workspacePermissionLevel !== "admin") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const clientId = process.env.FIGMA_CLIENT_ID?.trim();
  if (!clientId) {
    return NextResponse.json(
      { error: "Figma OAuth is not configured." },
      { status: 500 },
    );
  }

  const nonce = createFigmaOAuthNonce();
  const redirectUri = getRedirectUri();
  const authorizeUrl = new URL("https://www.figma.com/oauth");
  authorizeUrl.searchParams.set("client_id", clientId);
  authorizeUrl.searchParams.set("redirect_uri", redirectUri);
  authorizeUrl.searchParams.set("scope", "file_content:read file_metadata:read file_versions:read");
  authorizeUrl.searchParams.set("state", nonce);
  authorizeUrl.searchParams.set("response_type", "code");

  const response = NextResponse.redirect(authorizeUrl.toString());
  applyFigmaOAuthCookie(
    response,
    encodeFigmaOAuthState({
      nonce,
      workspaceId,
      userId: user.id,
    }),
  );
  return response;
}
