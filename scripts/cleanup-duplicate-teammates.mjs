/**
 * One-off cleanup: find workspace teammate rows that share an email and
 * delete orphaned Pending records, keeping the Active signed-up row.
 *
 * Usage (from repo root, with .env.local loaded by this script):
 *   node scripts/cleanup-duplicate-teammates.mjs
 *   node scripts/cleanup-duplicate-teammates.mjs --apply
 */
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const path = resolve(process.cwd(), ".env.local");
  const text = readFileSync(path, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
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

function normEmail(value) {
  return String(value ?? "").trim().toLowerCase();
}

loadEnvLocal();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
const key =
  process.env.SUPABASE_SECRET_KEY?.trim() ||
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or service role key.");
  process.exit(1);
}

const apply = process.argv.includes("--apply");
const service = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const { data: members, error: membersError } = await service
  .from("workspace_members")
  .select("id, workspace_id, user_id, status, invite_email, joined_at");
if (membersError) {
  console.error("workspace_members:", membersError.message);
  process.exit(1);
}

const { data: invites, error: invitesError } = await service
  .from("workspace_invites")
  .select("id, workspace_id, email, status, invited_name");
if (invitesError) {
  console.error("workspace_invites:", invitesError.message);
  process.exit(1);
}

const { data: contributors, error: contributorsError } = await service
  .from("contributors")
  .select("id, workspace_id, user_id, email, name, project_id, created_at");
if (contributorsError) {
  console.error("contributors:", contributorsError.message);
  process.exit(1);
}

const memberRows = members ?? [];
const inviteRows = invites ?? [];
const contributorRows = (contributors ?? []).filter((row) => row.project_id == null);

const pendingMemberIds = [];
const leftoverInviteIds = [];
const pendingContributorIds = [];
const nameFixes = [];

const membersByWorkspace = new Map();
for (const row of memberRows) {
  const key = String(row.workspace_id);
  if (!membersByWorkspace.has(key)) membersByWorkspace.set(key, []);
  membersByWorkspace.get(key).push(row);
}

const contributorsByWorkspace = new Map();
for (const row of contributorRows) {
  const key = String(row.workspace_id ?? "");
  if (!key) continue;
  if (!contributorsByWorkspace.has(key)) contributorsByWorkspace.set(key, []);
  contributorsByWorkspace.get(key).push(row);
}

function activeEmailsForWorkspace(workspaceId) {
  const emails = new Set();
  for (const row of membersByWorkspace.get(workspaceId) ?? []) {
    const active = String(row.status ?? "").toLowerCase() === "active" && row.user_id;
    if (!active) continue;
    const inviteEmail = normEmail(row.invite_email);
    if (inviteEmail) emails.add(inviteEmail);
    for (const contributor of contributorsByWorkspace.get(workspaceId) ?? []) {
      if (String(contributor.user_id ?? "") !== String(row.user_id)) continue;
      const email = normEmail(contributor.email);
      if (email) emails.add(email);
    }
  }
  return emails;
}

for (const [workspaceId, rows] of membersByWorkspace) {
  const activeEmails = activeEmailsForWorkspace(workspaceId);
  for (const row of rows) {
    const pending = String(row.status ?? "").toLowerCase() === "pending" || !row.user_id;
    const email = normEmail(row.invite_email);
    if (pending && email && activeEmails.has(email)) {
      pendingMemberIds.push({ workspaceId, email, id: row.id });
    }
  }
}

for (const invite of inviteRows) {
  if (String(invite.status ?? "") !== "pending") continue;
  const workspaceId = String(invite.workspace_id);
  const email = normEmail(invite.email);
  if (email && activeEmailsForWorkspace(workspaceId).has(email)) {
    leftoverInviteIds.push({
      workspaceId,
      email,
      id: invite.id,
      name: invite.invited_name,
    });
  }
}

for (const [workspaceId, rows] of contributorsByWorkspace) {
  const byEmail = new Map();
  for (const row of rows) {
    const email = normEmail(row.email);
    if (!email) continue;
    if (!byEmail.has(email)) byEmail.set(email, []);
    byEmail.get(email).push(row);
  }
  for (const [email, group] of byEmail) {
    if (group.length < 2) continue;
    const sorted = [...group].sort((a, b) => {
      const aLinked = a.user_id ? 1 : 0;
      const bLinked = b.user_id ? 1 : 0;
      if (aLinked !== bLinked) return bLinked - aLinked;
      return String(a.created_at ?? "").localeCompare(String(b.created_at ?? ""));
    });
    const keep = sorted[0];
    for (const drop of sorted.slice(1)) {
      if (drop.user_id) continue;
      pendingContributorIds.push({
        workspaceId,
        email,
        dropId: drop.id,
        keepId: keep.id,
        dropName: drop.name,
        keepName: keep.name,
      });
      const keepName = String(keep.name ?? "").trim();
      const dropName = String(drop.name ?? "").trim();
      const localPart = email.split("@")[0];
      if (dropName && (!keepName || keepName === localPart) && dropName !== keepName) {
        nameFixes.push({ id: keep.id, name: dropName, email });
      }
    }
  }
}

console.log("Pending workspace_members to delete:", pendingMemberIds.length);
console.log("Pending workspace_invites to accept:", leftoverInviteIds.length);
console.log("Pending contributors to delete:", pendingContributorIds.length);
console.log("Active names to restore from invite:", nameFixes.length);

if (leftoverInviteIds.length) {
  console.log(
    "Invite leftovers:",
    leftoverInviteIds.map((row) => `${row.email} (${row.name ?? "unnamed"})`).join(", "),
  );
}
if (pendingContributorIds.length) {
  console.log(
    "Contributor leftovers:",
    pendingContributorIds
      .map((row) => `${row.email}: drop "${row.dropName}" keep "${row.keepName}"`)
      .join(" | "),
  );
}

if (!apply) {
  console.log("Dry run only. Re-run with --apply to write changes.");
  process.exit(0);
}

async function remapSimpleFk(table, column, dropId, keepId) {
  const { data, error } = await service.from(table).select("id").eq(column, dropId);
  if (error) {
    if (/column|schema cache|does not exist/i.test(error.message)) return;
    console.error(`${table}.${column} lookup failed`, error.message);
    return;
  }
  for (const row of data ?? []) {
    const { error: updateError } = await service.from(table).update({ [column]: keepId }).eq("id", row.id);
    if (updateError) {
      console.error(`${table}.${column} remap failed`, updateError.message);
    }
  }
}

async function remapContributorRefs(dropId, keepId) {
  const { data: reviews, error: reviewsError } = await service
    .from("reviews")
    .select("id, reviewer_contributor_ids, decision_owner_id");
  if (reviewsError) {
    console.error("reviews lookup failed", reviewsError.message);
  } else {
    for (const review of reviews ?? []) {
      const ids = Array.isArray(review.reviewer_contributor_ids)
        ? review.reviewer_contributor_ids.map(String)
        : [];
      const patch = {};
      if (ids.includes(dropId)) {
        patch.reviewer_contributor_ids = [...new Set(ids.map((id) => (id === dropId ? keepId : id)))];
      }
      if (String(review.decision_owner_id ?? "") === dropId) {
        patch.decision_owner_id = keepId;
      }
      if (Object.keys(patch).length === 0) continue;
      const { error } = await service.from("reviews").update(patch).eq("id", review.id);
      if (error) console.error("reviews remap failed", error.message);
    }
  }

  const { data: feedback } = await service
    .from("reviewer_feedback")
    .select("id, review_id, reviewer_id")
    .eq("reviewer_id", dropId);
  for (const row of feedback ?? []) {
    const { data: existing } = await service
      .from("reviewer_feedback")
      .select("id")
      .eq("review_id", row.review_id)
      .eq("reviewer_id", keepId)
      .maybeSingle();
    if (existing?.id) {
      await service.from("reviewer_feedback").delete().eq("id", row.id);
    } else {
      const { error } = await service
        .from("reviewer_feedback")
        .update({ reviewer_id: keepId })
        .eq("id", row.id);
      if (error) console.error("reviewer_feedback remap failed", error.message);
    }
  }

  const simpleRemaps = [
    ["reviewer_feedback", "reply_by_id"],
    ["change_requests", "reviewer_id"],
    ["change_requests", "completed_by_id"],
    ["change_requests", "submitted_by_id"],
    ["change_request_replies", "reply_by_id"],
    ["card_replies", "reply_by_id"],
    ["timeline_events", "actor_id"],
    ["review_activity", "contributor_id"],
    ["artifacts", "created_by"],
    ["artifact_versions", "created_by"],
    ["access_requests", "requested_by"],
    ["access_requests", "requested_to"],
    ["review_decision_snapshots", "decision_owner_id"],
  ];
  for (const [table, column] of simpleRemaps) {
    await remapSimpleFk(table, column, dropId, keepId);
  }
}

for (const row of nameFixes) {
  const { error } = await service.from("contributors").update({ name: row.name }).eq("id", row.id);
  if (error) console.error("name fix failed", row.email, error.message);
}

for (const row of pendingMemberIds) {
  const { error } = await service.from("workspace_members").delete().eq("id", row.id);
  if (error) console.error("member delete failed", row.email, error.message);
}

for (const row of leftoverInviteIds) {
  const { error } = await service
    .from("workspace_invites")
    .update({ status: "accepted" })
    .eq("id", row.id);
  if (error) console.error("invite accept failed", row.email, error.message);
}

for (const row of pendingContributorIds) {
  await remapContributorRefs(row.dropId, row.keepId);
  const { error } = await service.from("contributors").delete().eq("id", row.dropId);
  if (error) {
    console.error("contributor delete failed", row.email, error.message);
  }
}

console.log("Cleanup applied.");
