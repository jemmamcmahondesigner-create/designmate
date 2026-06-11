"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { logTimelineEventServer } from "@/lib/timeline/logEventServer";
import { resolveProjectClientFields } from "@/lib/projects/resolveProjectClientFields";
import { resolveReviewCompleteTarget } from "@/lib/projects/reviewCompleteOnProjectComplete";
import { sendProjectCompletedNotifications } from "@/lib/projects/send-project-completed-notifications";
import type { ProjectStatus } from "@/types/project";

export type SaveProjectEditsInput = {
  projectId: string;
  name: string;
  description: string | null;
  clientId: string | null;
  status: ProjectStatus;
  previous: {
    name: string;
    description: string | null;
    clientId: string | null;
    clientName: string | null;
    status: ProjectStatus;
  };
};

export type ProjectActionResult =
  | { success: true }
  | { success: false; message: string };

async function getActorName(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return "A teammate";

  const { data: contributor } = await supabase
    .from("contributors")
    .select("name")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const name = String((contributor as { name?: string | null } | null)?.name ?? "").trim();
  if (name) return name;

  return (
    (user.user_metadata?.display_name as string | undefined)?.trim() ||
    (user.user_metadata?.full_name as string | undefined)?.trim() ||
    user.email?.split("@")[0] ||
    "A teammate"
  );
}

export async function saveProjectEditsAction(
  input: SaveProjectEditsInput,
): Promise<ProjectActionResult> {
  const supabase = await createSupabaseServerClient();
  const projectId = input.projectId.trim();
  const trimmedName = input.name.trim();
  if (!projectId || !trimmedName) {
    return { success: false, message: "Project name is required." };
  }

  const clientFields = await resolveProjectClientFields(supabase, {
    clientId: input.clientId,
  });

  const { error } = await supabase
    .from("projects")
    .update({
      name: trimmedName,
      client: clientFields.client,
      client_id: clientFields.client_id,
      description: input.description?.trim() || null,
      status: input.status,
    })
    .eq("id", projectId);

  if (error) {
    return { success: false, message: error.message };
  }

  const batchCreatedAt = new Date().toISOString();
  const prev = input.previous;
  const nextClientName = clientFields.client?.trim() ?? "";

  if (prev.status !== input.status) {
    await logTimelineEventServer(supabase, {
      projectId,
      reviewId: null,
      eventType: "status_changed",
      createdAt: batchCreatedAt,
      payload: {
        entity: "project",
        from: prev.status,
        to: input.status,
        previous_status: prev.status,
        new_status: input.status,
        from_status: prev.status,
        to_status: input.status,
        status_transition_trigger: "manual",
      },
    });
  }

  if (prev.name.trim() !== trimmedName) {
    await logTimelineEventServer(supabase, {
      projectId,
      reviewId: null,
      eventType: "project_updated",
      createdAt: batchCreatedAt,
      payload: { field: "name", from: prev.name.trim(), to: trimmedName },
    });
  }

  const prevDesc = prev.description?.trim() ?? "";
  const nextDesc = input.description?.trim() ?? "";
  if (prevDesc !== nextDesc) {
    await logTimelineEventServer(supabase, {
      projectId,
      reviewId: null,
      eventType: "project_updated",
      createdAt: batchCreatedAt,
      payload: { field: "description" },
    });
  }

  const prevClientId = prev.clientId ?? "";
  const nextClientId = clientFields.client_id ?? "";
  if (prevClientId !== nextClientId || (prev.clientName ?? "") !== nextClientName) {
    await logTimelineEventServer(supabase, {
      projectId,
      reviewId: null,
      eventType: "project_updated",
      createdAt: batchCreatedAt,
      payload: { field: "client", to: nextClientName || null },
    });
  }

  return { success: true };
}

export async function completeProjectAction(
  input: SaveProjectEditsInput,
): Promise<ProjectActionResult> {
  const supabase = await createSupabaseServerClient();
  const projectId = input.projectId.trim();
  const trimmedName = input.name.trim();
  if (!projectId || !trimmedName) {
    return { success: false, message: "Project name is required." };
  }

  const clientFields = await resolveProjectClientFields(supabase, {
    clientId: input.clientId,
  });

  const { data: reviews, error: reviewsError } = await supabase
    .from("reviews")
    .select("id, title, status, review_type")
    .eq("project_id", projectId);

  if (reviewsError) {
    return { success: false, message: reviewsError.message };
  }

  const batchCreatedAt = new Date().toISOString();
  const reviewUpdates: Array<{
    id: string;
    title: string;
    from: string;
    to: string;
  }> = [];

  const reviewUpdateTasks: Array<Promise<void>> = [];

  for (const row of reviews ?? []) {
    const r = row as {
      id?: string;
      title?: string | null;
      status?: string | null;
      review_type?: string | null;
    };
    const id = String(r.id ?? "");
    if (!id) continue;
    const fromStatus = String(r.status ?? "");
    const target = resolveReviewCompleteTarget(
      String(r.review_type ?? ""),
      fromStatus,
    );
    if (target === "unchanged") continue;

    const toStatus = target === "complete" ? "complete" : "draft";
    const normalizedFrom = fromStatus.trim().toLowerCase().replace(/[\s_]+/g, "-");
    const normalizedTo = toStatus.trim().toLowerCase().replace(/[\s_]+/g, "-");
    if (normalizedFrom === normalizedTo) continue;

    reviewUpdates.push({
      id,
      title: String(r.title ?? "Untitled"),
      from: fromStatus,
      to: toStatus,
    });
    reviewUpdateTasks.push(
      (async () => {
        const { error: reviewError } = await supabase
          .from("reviews")
          .update({ status: toStatus })
          .eq("id", id);
        if (reviewError) throw new Error(reviewError.message);
      })(),
    );
  }

  try {
    await Promise.all(reviewUpdateTasks);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not update reviews.";
    return { success: false, message };
  }

  const { error: projectError } = await supabase
    .from("projects")
    .update({
      name: trimmedName,
      client: clientFields.client,
      client_id: clientFields.client_id,
      description: input.description?.trim() || null,
      status: "complete",
    })
    .eq("id", projectId);

  if (projectError) {
    return { success: false, message: projectError.message };
  }

  const prev = input.previous;

  if (prev.name.trim() !== trimmedName) {
    await logTimelineEventServer(supabase, {
      projectId,
      reviewId: null,
      eventType: "project_updated",
      createdAt: batchCreatedAt,
      payload: { field: "name", from: prev.name.trim(), to: trimmedName },
    });
  }

  const prevDesc = prev.description?.trim() ?? "";
  const nextDesc = input.description?.trim() ?? "";
  if (prevDesc !== nextDesc) {
    await logTimelineEventServer(supabase, {
      projectId,
      reviewId: null,
      eventType: "project_updated",
      createdAt: batchCreatedAt,
      payload: { field: "description" },
    });
  }

  const nextClientName = clientFields.client?.trim() ?? "";
  const prevClientId = prev.clientId ?? "";
  const nextClientId = clientFields.client_id ?? "";
  if (prevClientId !== nextClientId || (prev.clientName ?? "") !== nextClientName) {
    await logTimelineEventServer(supabase, {
      projectId,
      reviewId: null,
      eventType: "project_updated",
      createdAt: batchCreatedAt,
      payload: { field: "client", to: nextClientName || null },
    });
  }

  await logTimelineEventServer(supabase, {
    projectId,
    reviewId: null,
    eventType: "status_changed",
    createdAt: batchCreatedAt,
    payload: {
      entity: "project",
      from: prev.status,
      to: "complete",
      previous_status: prev.status,
      new_status: "complete",
      from_status: prev.status,
      to_status: "complete",
      status_transition_trigger: "manual",
    },
  });

  for (const review of reviewUpdates) {
    await logTimelineEventServer(supabase, {
      projectId,
      reviewId: review.id,
      eventType: "status_changed",
      createdAt: batchCreatedAt,
      payload: {
        entity: "review",
        reviewId: review.id,
        reviewTitle: review.title,
        review_title: review.title,
        from: review.from,
        to: review.to,
        previous_status: review.from,
        new_status: review.to,
        from_status: review.from,
        to_status: review.to,
        status_transition_trigger: "auto",
      },
    });
  }

  const actorName = await getActorName(supabase);
  await sendProjectCompletedNotifications({
    supabase,
    projectId,
    projectName: trimmedName,
    actorName,
  });

  return { success: true };
}

export async function reactivateProjectAction(
  projectId: string,
): Promise<ProjectActionResult> {
  const supabase = await createSupabaseServerClient();
  const pid = projectId.trim();
  if (!pid) return { success: false, message: "Project not found." };

  const { data: existing, error: loadError } = await supabase
    .from("projects")
    .select("status")
    .eq("id", pid)
    .maybeSingle();

  if (loadError || !existing) {
    return { success: false, message: loadError?.message ?? "Project not found." };
  }

  const previousStatus = String(
    (existing as { status?: string | null }).status ?? "complete",
  ) as ProjectStatus;

  const { error } = await supabase
    .from("projects")
    .update({ status: "active" })
    .eq("id", pid);

  if (error) {
    return { success: false, message: error.message };
  }

  await logTimelineEventServer(supabase, {
    projectId: pid,
    reviewId: null,
    eventType: "status_changed",
    payload: {
      entity: "project",
      from: previousStatus,
      to: "active",
      previous_status: previousStatus,
      new_status: "active",
      from_status: previousStatus,
      to_status: "active",
      status_transition_trigger: "manual",
    },
  });

  return { success: true };
}
