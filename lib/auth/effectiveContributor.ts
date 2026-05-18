import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { getDevImpersonatedContributorId } from "@/lib/auth/devImpersonation";
import {
  resolveEffectiveContributor,
  type ContributorIdentity,
} from "@/lib/auth/resolveEffectiveContributor";

export type { ContributorIdentity };

export async function getEffectiveCurrentContributor(
  supabase: SupabaseClient,
  projectId?: string
): Promise<ContributorIdentity | null> {
  const devContributorId = await getDevImpersonatedContributorId();
  return resolveEffectiveContributor(supabase, projectId, devContributorId);
}
