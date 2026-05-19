import type { SupabaseClient } from "@supabase/supabase-js";

type EnsureContributorProfileInput = {
  userId: string;
  email: string | null;
  displayName: string;
  role: string | null;
  activeWorkspaceId: string | null;
};

export async function ensureContributorProfile(
  supabase: SupabaseClient,
  input: EnsureContributorProfileInput,
): Promise<void> {
  const { userId, email, displayName, role, activeWorkspaceId } = input;
  if (!activeWorkspaceId || !displayName.trim()) return;

  const name = displayName.trim();
  const roleValue = role?.trim() || null;
  const emailValue = email?.trim() || null;

  let existingId: string | null = null;

  const byUserId = await supabase
    .from("contributors")
    .select("id")
    .eq("workspace_id", activeWorkspaceId)
    .eq("user_id", userId)
    .maybeSingle();

  if (!byUserId.error && byUserId.data) {
    existingId = String((byUserId.data as Record<string, unknown>).id ?? "");
  } else if (emailValue) {
    const byEmail = await supabase
      .from("contributors")
      .select("id")
      .eq("workspace_id", activeWorkspaceId)
      .ilike("email", emailValue)
      .maybeSingle();
    if (!byEmail.error && byEmail.data) {
      existingId = String((byEmail.data as Record<string, unknown>).id ?? "");
    }
  }

  const payload = {
    workspace_id: activeWorkspaceId,
    user_id: userId,
    name,
    email: emailValue,
    role: roleValue,
    project_id: null as string | null,
    permission_level: "admin" as const,
    is_paid: true,
  };

  if (existingId) {
    await supabase.from("contributors").update(payload).eq("id", existingId);
    return;
  }

  await supabase.from("contributors").insert(payload);
}
