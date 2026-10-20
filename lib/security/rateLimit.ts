import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";

export async function rateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc("check_rate_limit", {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });
    if (error) {
      console.error("[rateLimit] check_rate_limit failed:", error);
      return true;
    }
    return data === true;
  } catch (err) {
    console.error("[rateLimit] unexpected error:", err);
    return true;
  }
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

export function rateLimitedResponse() {
  return NextResponse.json({ error: "rate_limited" }, { status: 429 });
}
