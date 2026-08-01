import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/admin";

function getAppOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "http://localhost:3000"
  ).replace(/\/$/, "");
}

function getRedirectUri(): string {
  return `${getAppOrigin()}/api/auth/figma/callback`;
}

function settingsRedirect(status: "connected" | "error") {
  return NextResponse.redirect(`${getAppOrigin()}/settings?figma=${status}`);
}

function figmaBasicAuthHeader(clientId: string, clientSecret: string): string {
  const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  return `Basic ${encoded}`;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const code = searchParams.get("code")?.trim();
    const workspaceId = searchParams.get("state")?.trim();

    if (!code || !workspaceId) {
      return NextResponse.json(
        { error: "Missing code or state." },
        { status: 400 },
      );
    }

    const supabase = await createSupabaseServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return settingsRedirect("error");
    }

    const clientId = process.env.FIGMA_CLIENT_ID?.trim();
    const clientSecret = process.env.FIGMA_CLIENT_SECRET?.trim();
    if (!clientId || !clientSecret) {
      return settingsRedirect("error");
    }

    const redirectUri = getRedirectUri();
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      code,
      grant_type: "authorization_code",
    });

    const tokenRes = await fetch("https://api.figma.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: figmaBasicAuthHeader(clientId, clientSecret),
      },
      body,
    });

    if (!tokenRes.ok) {
      console.error("[figma/callback] token exchange failed:", tokenRes.status);
      return settingsRedirect("error");
    }

    const tokenJson = (await tokenRes.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (
      !tokenJson.access_token ||
      !tokenJson.refresh_token ||
      typeof tokenJson.expires_in !== "number"
    ) {
      console.error("[figma/callback] unexpected token response shape");
      return settingsRedirect("error");
    }

    const expiresAt = new Date(
      Date.now() + tokenJson.expires_in * 1000,
    ).toISOString();

    const service = createServiceClient();
    const { error: upsertError } = await service
      .from("workspace_figma_tokens")
      .upsert(
        {
          workspace_id: workspaceId,
          access_token: tokenJson.access_token,
          refresh_token: tokenJson.refresh_token,
          expires_at: expiresAt,
          connected_by: user.id,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "workspace_id" },
      );

    if (upsertError) {
      console.error("[figma/callback] upsert failed:", upsertError);
      return settingsRedirect("error");
    }

    return settingsRedirect("connected");
  } catch (err) {
    console.error("[figma/callback] unexpected error:", err);
    return settingsRedirect("error");
  }
}
