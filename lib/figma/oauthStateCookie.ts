import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";

export const FIGMA_OAUTH_STATE_COOKIE = "figma_oauth_state";
export const FIGMA_OAUTH_STATE_PATH = "/api/auth/figma";
export const FIGMA_OAUTH_STATE_MAX_AGE = 600;

export type FigmaOAuthStatePayload = {
  nonce: string;
  workspaceId: string;
  userId: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const NONCE_RE = /^[0-9a-f]{64}$/i;

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: true,
  sameSite: "lax" as const,
  path: FIGMA_OAUTH_STATE_PATH,
};

export function createFigmaOAuthNonce(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function encodeFigmaOAuthState(payload: FigmaOAuthStatePayload): string {
  return `${payload.nonce}.${payload.workspaceId}.${payload.userId}`;
}

export function parseFigmaOAuthState(
  raw: string | undefined | null,
): FigmaOAuthStatePayload | null {
  const value = String(raw ?? "").trim();
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3) return null;
  const [nonce, workspaceId, userId] = parts;
  if (!NONCE_RE.test(nonce) || !UUID_RE.test(workspaceId) || !UUID_RE.test(userId)) {
    return null;
  }
  return { nonce, workspaceId, userId };
}

export function timingSafeEqualText(left: string, right: string): boolean {
  const a = Buffer.from(left, "utf8");
  const b = Buffer.from(right, "utf8");
  if (a.length !== b.length) {
    const dummy = Buffer.alloc(a.length);
    if (a.length > 0) timingSafeEqual(a, dummy);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function applyFigmaOAuthCookie(response: NextResponse, value: string) {
  response.cookies.set(FIGMA_OAUTH_STATE_COOKIE, value, {
    ...COOKIE_OPTIONS,
    maxAge: FIGMA_OAUTH_STATE_MAX_AGE,
  });
}

export function clearFigmaOAuthCookie(response: NextResponse) {
  response.cookies.set(FIGMA_OAUTH_STATE_COOKIE, "", {
    ...COOKIE_OPTIONS,
    maxAge: 0,
  });
}

export function readFigmaOAuthCookie(request: Request): string | null {
  const header = request.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    if (key !== FIGMA_OAUTH_STATE_COOKIE) continue;
    const raw = part.slice(idx + 1).trim();
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  }
  return null;
}
