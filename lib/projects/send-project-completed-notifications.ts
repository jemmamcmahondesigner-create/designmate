import type { SupabaseClient } from "@supabase/supabase-js";
import { getProjectCompletedEmailHtml } from "@/lib/emails/project-completed-email";
import { sendResendEmail } from "@/lib/emails/send-resend-email";
import { getAppOrigin } from "@/lib/workspace/invite-server";

export async function sendProjectCompletedNotifications({
  supabase,
  projectId,
  projectName,
  actorName,
}: {
  supabase: SupabaseClient;
  projectId: string;
  projectName: string;
  actorName: string;
}): Promise<{ sent: number }> {
  const pid = projectId.trim();
  if (!pid) return { sent: 0 };

  const { data: contributors, error } = await supabase
    .from("contributors")
    .select("email, name")
    .eq("project_id", pid);

  if (error) {
    console.error("[sendProjectCompletedNotifications] contributors load failed:", error.message);
    return { sent: 0 };
  }

  const subject = `${projectName.trim() || "Project"} has been completed`;
  const projectUrl = `${getAppOrigin()}/projects/${pid}`;
  const html = getProjectCompletedEmailHtml({
    actorName: actorName.trim() || "A teammate",
    projectName: projectName.trim() || "Project",
    projectUrl,
  });

  const emails = [
    ...new Set(
      (contributors ?? [])
        .map((row) => {
          const email = String((row as { email?: string | null }).email ?? "").trim();
          return email || null;
        })
        .filter((email): email is string => Boolean(email)),
    ),
  ];

  const results = await Promise.all(
    emails.map((to) =>
      sendResendEmail({ to, subject, html }).then(
        () => true,
        (err) => {
          console.error("[sendProjectCompletedNotifications] send failed:", err);
          return false;
        },
      ),
    ),
  );

  return { sent: results.filter(Boolean).length };
}
