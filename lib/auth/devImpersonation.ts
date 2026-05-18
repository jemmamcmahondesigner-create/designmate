import "server-only";

import { cookies } from "next/headers";
import {
  DEV_IMPERSONATION_COOKIE,
  isDevImpersonationEnabled,
} from "@/lib/auth/devImpersonationShared";

export { DEV_IMPERSONATION_COOKIE, isDevImpersonationEnabled } from "@/lib/auth/devImpersonationShared";

export async function getDevImpersonatedContributorId() {
  if (!isDevImpersonationEnabled()) return null;
  const cookieStore = await cookies();
  const value = cookieStore.get(DEV_IMPERSONATION_COOKIE)?.value?.trim();
  return value ? value : null;
}
