import { redirect } from "next/navigation";
import { getPostAuthPath } from "@/lib/auth/mapAuthError";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export default async function DashboardPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  redirect(getPostAuthPath(user.user_metadata));
}
