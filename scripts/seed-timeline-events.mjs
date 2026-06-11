import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

function loadEnvFile(envPath) {
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = value;
  }
}

const projectRoot = process.cwd();
loadEnvFile(path.join(projectRoot, ".env.local"));

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !anonKey) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY");
}

const supabase = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false }
});

function addMinutes(iso, minutes) {
  const base = new Date(iso);
  if (Number.isNaN(base.getTime())) return new Date().toISOString();
  return new Date(base.getTime() + minutes * 60_000).toISOString();
}

async function run() {
  const { error: deleteError } = await supabase
    .from("timeline_events")
    .delete()
    .is("actor_id", null);
  if (deleteError) throw deleteError;

  const { data: projects, error: projectsError } = await supabase
    .from("projects")
    .select("id, name, created_at");
  if (projectsError) throw projectsError;

  const { data: reviews, error: reviewsError } = await supabase
    .from("reviews")
    .select("id, project_id, title, status, created_at, review_type");
  if (reviewsError) throw reviewsError;

  const inserts = [];

  for (const project of projects ?? []) {
    const p = project;
    const projectCreatedAt = p.created_at ?? new Date().toISOString();
    const projectId = p.id;
    inserts.push({
      created_at: projectCreatedAt,
      project_id: projectId,
      review_id: null,
      actor_id: null,
      event_type: "project_created",
      payload: { project_name: p.name ?? "Project" }
    });
    inserts.push({
      created_at: addMinutes(projectCreatedAt, 30),
      project_id: projectId,
      review_id: null,
      actor_id: null,
      event_type: "problem_added",
      payload: { problem_text: "Users struggle to navigate the current interface" }
    });
    inserts.push({
      created_at: addMinutes(projectCreatedAt, 45),
      project_id: projectId,
      review_id: null,
      actor_id: null,
      event_type: "problem_added",
      payload: { problem_text: "Mobile experience is inconsistent with desktop" }
    });
    inserts.push({
      created_at: addMinutes(projectCreatedAt, 60),
      project_id: projectId,
      review_id: null,
      actor_id: null,
      event_type: "teammate_added",
      payload: { teammate_name: "Tom Tomato" }
    });
  }

  for (const review of reviews ?? []) {
    const r = review;
    const createdAt = r.created_at ?? new Date().toISOString();
    const projectId = r.project_id;
    const reviewId = r.id;
    if (!projectId || !reviewId) continue;

    inserts.push({
      created_at: createdAt,
      project_id: projectId,
      review_id: reviewId,
      actor_id: null,
      event_type: "review_created",
      payload: {
        review_title: r.title ?? "Review",
        review_id: reviewId,
        review_status: r.status ?? "in-review",
        review_type: r.review_type ?? null
      }
    });
    inserts.push({
      created_at: addMinutes(createdAt, 60),
      project_id: projectId,
      review_id: reviewId,
      actor_id: null,
      event_type: "artifact_uploaded",
      payload: {
        iteration_label: "Iteration 1",
        artifact_names: ["Concept A", "Concept B"]
      }
    });
    inserts.push({
      created_at: addMinutes(createdAt, 180),
      project_id: projectId,
      review_id: reviewId,
      actor_id: null,
      event_type: "feedback_provided",
      payload: {
        review_title: r.title ?? "Review",
        review_id: reviewId,
        review_type: r.review_type ?? null
      }
    });
    inserts.push({
      created_at: addMinutes(createdAt, 240),
      project_id: projectId,
      review_id: reviewId,
      actor_id: null,
      event_type: "changes_requested",
      payload: {
        artifact_name: "Concept A",
        review_title: r.title ?? "Review",
        review_id: reviewId,
        review_type: r.review_type ?? null
      }
    });
    inserts.push({
      created_at: addMinutes(createdAt, 300),
      project_id: projectId,
      review_id: reviewId,
      actor_id: null,
      event_type: "concept_selected",
      payload: {
        concept_name: "Concept B",
        review_title: r.title ?? "Review",
        review_id: reviewId,
        review_type: r.review_type ?? null,
        selection_stage: "final"
      }
    });
    inserts.push({
      created_at: addMinutes(createdAt, 360),
      project_id: projectId,
      review_id: reviewId,
      actor_id: null,
      event_type: "review_approved",
      payload: {
        review_title: r.title ?? "Review",
        review_id: reviewId
      }
    });
  }

  if (inserts.length === 0) {
    return;
  }

  const { error: insertError } = await supabase.from("timeline_events").insert(inserts);
  if (insertError) throw insertError;

}

run().catch((error) => {
  console.error("Failed to seed timeline events:", error);
  process.exitCode = 1;
});
