import { createServiceClient } from "@/lib/supabase/admin";

const REFRESH_BUFFER_MS = 5 * 60 * 1000;

function figmaBasicAuthHeader(clientId: string, clientSecret: string): string {
  const encoded = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  return `Basic ${encoded}`;
}

export async function getValidFigmaToken(
  workspaceId: string,
): Promise<string | null> {
  const service = createServiceClient();
  const { data: row, error } = await service
    .from("workspace_figma_tokens")
    .select("access_token, refresh_token, expires_at")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (error || !row) {
    return null;
  }

  const accessToken =
    typeof row.access_token === "string" ? row.access_token : null;
  const refreshToken =
    typeof row.refresh_token === "string" ? row.refresh_token : null;
  const expiresAtMs = row.expires_at
    ? new Date(row.expires_at as string).getTime()
    : NaN;

  if (!accessToken) {
    return null;
  }

  const needsRefresh =
    !Number.isFinite(expiresAtMs) || expiresAtMs - Date.now() <= REFRESH_BUFFER_MS;

  if (!needsRefresh) {
    return accessToken;
  }

  if (!refreshToken) {
    return null;
  }

  const clientId = process.env.FIGMA_CLIENT_ID?.trim();
  const clientSecret = process.env.FIGMA_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return null;
  }

  try {
    const body = new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    });

    const refreshRes = await fetch("https://api.figma.com/v1/oauth/refresh", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: figmaBasicAuthHeader(clientId, clientSecret),
      },
      body,
    });

    if (!refreshRes.ok) {
      console.error(
        "[getValidFigmaToken] refresh failed:",
        refreshRes.status,
      );
      return null;
    }

    const refreshJson = (await refreshRes.json()) as {
      access_token?: string;
      expires_in?: number;
    };

    if (
      !refreshJson.access_token ||
      typeof refreshJson.expires_in !== "number"
    ) {
      return null;
    }

    const expiresAt = new Date(
      Date.now() + refreshJson.expires_in * 1000,
    ).toISOString();

    const { error: updateError } = await service
      .from("workspace_figma_tokens")
      .update({
        access_token: refreshJson.access_token,
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("workspace_id", workspaceId);

    if (updateError) {
      console.error("[getValidFigmaToken] update failed:", updateError);
      return null;
    }

    return refreshJson.access_token;
  } catch (err) {
    console.error("[getValidFigmaToken] network error:", err);
    return null;
  }
}
