import { SubscriptionSettingsPage } from "@/components/settings/SubscriptionSettingsPage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { redirectReviewerFromRestrictedSettings } from "@/lib/workspace/redirectReviewerFromRestrictedSettings";

export default async function SettingsSubscriptionPage() {
  await redirectReviewerFromRestrictedSettings();

  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("contributors")
    .select("id", { count: "exact", head: true })
    .eq("permission_level", "editor")
    .is("deleted_at", null);

  return <SubscriptionSettingsPage editorCount={count ?? 0} />;
}
