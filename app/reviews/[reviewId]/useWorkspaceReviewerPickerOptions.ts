'use client';

import { useEffect, useMemo, useState } from 'react';
import { createSupabaseBrowserClient } from '@/lib/supabase/client';
import type { WorkspaceContributorPickerOption } from '@/lib/workspace/teammates';

export type ReviewerPickerOption = {
  id: string;
  name: string;
  role: string;
  email?: string | null;
  userId: string;
  isPending?: boolean;
};

type AssignedReviewerRef = {
  id: string;
  userId?: string | null;
};

export function useWorkspaceReviewerPickerOptions(
  workspaceId: string | null,
  assignedReviewers: AssignedReviewerRef[],
) {
  const [assignableOptions, setAssignableOptions] = useState<ReviewerPickerOption[]>([]);
  const [userIdByContributorId, setUserIdByContributorId] = useState<Map<string, string>>(
    () => new Map(),
  );

  const assignedReviewerKey = useMemo(
    () =>
      assignedReviewers
        .map((reviewer) => `${reviewer.id}:${reviewer.userId ?? ''}`)
        .join('|'),
    [assignedReviewers],
  );

  useEffect(() => {
    if (!workspaceId) {
      setAssignableOptions([]);
      setUserIdByContributorId(new Map());
      return;
    }

    let cancelled = false;
    const supabase = createSupabaseBrowserClient();

    void (async () => {
      const excludeUserIds = new Set<string>();
      const excludeContributorIds = new Set<string>();
      const userIdMap = new Map<string, string>();
      const unresolvedContributorIds: string[] = [];

      for (const reviewer of assignedReviewers) {
        const contributorId = reviewer.id.trim();
        if (!contributorId) continue;
        excludeContributorIds.add(contributorId);

        const knownUserId = String(reviewer.userId ?? '').trim();
        if (knownUserId) {
          userIdMap.set(contributorId, knownUserId);
          excludeUserIds.add(knownUserId);
        } else {
          unresolvedContributorIds.push(contributorId);
        }
      }

      if (unresolvedContributorIds.length > 0) {
        const { data: assignedRows } = await supabase
          .from('contributors')
          .select('id, user_id')
          .in('id', unresolvedContributorIds);

        for (const row of assignedRows ?? []) {
          const id = String((row as { id?: string }).id ?? '').trim();
          const userId = String(
            (row as { user_id?: string | null }).user_id ?? '',
          ).trim();
          if (id && userId) {
            userIdMap.set(id, userId);
            excludeUserIds.add(userId);
          }
        }
      }

      const params = new URLSearchParams({ workspaceId });
      if (excludeUserIds.size > 0) {
        params.set('excludeUserIds', Array.from(excludeUserIds).join(','));
      }
      if (excludeContributorIds.size > 0) {
        params.set('excludeContributorIds', Array.from(excludeContributorIds).join(','));
      }

      const response = await fetch(
        `/api/workspace/contributor-picker-options?${params.toString()}`,
      );
      if (!response.ok || cancelled) {
        if (!cancelled) {
          setAssignableOptions([]);
          setUserIdByContributorId(userIdMap);
        }
        return;
      }

      const payload = (await response.json()) as {
        options?: WorkspaceContributorPickerOption[];
      };
      const options = payload.options ?? [];
      if (cancelled) return;

      for (const option of options) {
        userIdMap.set(option.id, option.userId);
      }

      setAssignableOptions(options);
      setUserIdByContributorId(userIdMap);
    })();

    return () => {
      cancelled = true;
    };
  }, [workspaceId, assignedReviewerKey]);

  return { assignableOptions, userIdByContributorId };
}
