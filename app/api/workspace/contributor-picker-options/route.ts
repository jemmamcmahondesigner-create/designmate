import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { fetchWorkspaceContributorPickerOptions } from "@/lib/workspace/teammates";

export async function GET(request: Request) {
  const workspaceId = new URL(request.url).searchParams
    .get("workspaceId")
    ?.trim();
  const excludeRaw = new URL(request.url).searchParams.get("excludeUserIds");
  const excludeUserIds = (excludeRaw ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!workspaceId) {
    return NextResponse.json(
      { error: "workspaceId is required." },
      { status: 400 },
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("workspace_members")
    .select("id")
    .eq("workspace_id", workspaceId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!membership) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const service = createServiceClient();
  const options = await fetchWorkspaceContributorPickerOptions(
    service,
    workspaceId,
    { excludeUserIds },
  );

  return NextResponse.json({ options });
}
