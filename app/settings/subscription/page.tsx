import { SubscriptionSettingsPage } from "@/components/settings/SubscriptionSettingsPage";
import { createSupabaseServerClient } from "@/lib/supabase/server";
export default async function SettingsSubscriptionPage() {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("contributors")
    .select("id", { count: "exact", head: true })
    .eq("permission_level", "editor")
    .is("deleted_at", null);

  return <SubscriptionSettingsPage editorCount={count ?? 0} />;
}
