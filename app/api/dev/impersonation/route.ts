import { NextResponse } from "next/server";
import {
  DEV_IMPERSONATION_COOKIE,
  isDevImpersonationEnabled,
} from "@/lib/auth/devImpersonation";

const ONE_WEEK_SECONDS = 60 * 60 * 24 * 7;

function blockedResponse() {
  return NextResponse.json({ error: "Not found." }, { status: 404 });
}

export async function POST(request: Request) {
  if (!isDevImpersonationEnabled()) return blockedResponse();

  const body = (await request.json().catch(() => ({}))) as {
    contributorId?: string;
  };
  const contributorId = body.contributorId?.trim();
  if (!contributorId) {
    return NextResponse.json({ error: "contributorId is required." }, { status: 400 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(DEV_IMPERSONATION_COOKIE, contributorId, {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ONE_WEEK_SECONDS,
  });
  return response;
}

export async function DELETE() {
  if (!isDevImpersonationEnabled()) return blockedResponse();

  const response = NextResponse.json({ ok: true });
  response.cookies.set(DEV_IMPERSONATION_COOKIE, "", {
    httpOnly: false,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
