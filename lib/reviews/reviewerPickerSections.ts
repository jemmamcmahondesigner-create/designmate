/*
 * STEP 0 — Reviewer selection menu findings:
 * - CreateReviewDrawer.tsx: sectioned Menu (Project teammates / All members)
 * - AddReviewerDropdown.tsx: flat checkbox list (edit review overview)
 * - ReviewDetailView.tsx RHC popover: out of scope (DO NOT TOUCH)
 * - Avatar colours: getAvatarColour / getAvatarInlineStyle from @/lib/utils/avatarColour
 *   keyed by contributors.id (never auth user id)
 */

export type ReviewerPickerPerson = {
  id: string;
  name: string;
  email?: string | null;
  userId?: string | null;
  avatarUrl?: string | null;
  isPending?: boolean;
};

/** Stable identity for deduping the same person across contributor rows. */
export function reviewerPickerIdentityKey(person: ReviewerPickerPerson): string {
  const userId = person.userId?.trim();
  if (userId) return `user:${userId}`;
  const email = person.email?.trim().toLowerCase();
  if (email) return `email:${email}`;
  return `id:${person.id.trim()}`;
}

export type ReviewerPickerSections = {
  projectTeammates: ReviewerPickerPerson[];
  otherWorkspaceMembers: ReviewerPickerPerson[];
  /** When false, render a single flat list (no section headings). */
  showSectionHeadings: boolean;
};

/**
 * Split workspace members into project teammates vs everyone else.
 * Never returns the same contributor id or identity in both lists.
 */
export function splitReviewerPickerSections(
  projectTeammates: ReviewerPickerPerson[],
  workspaceMembers: ReviewerPickerPerson[],
): ReviewerPickerSections {
  const projectIds = new Set(
    projectTeammates.map((person) => person.id.trim()).filter(Boolean),
  );
  const projectIdentityKeys = new Set(projectTeammates.map(reviewerPickerIdentityKey));

  const otherWorkspaceMembers = workspaceMembers.filter((person) => {
    const id = person.id.trim();
    if (!id || projectIds.has(id)) return false;
    return !projectIdentityKeys.has(reviewerPickerIdentityKey(person));
  });

  return {
    projectTeammates,
    otherWorkspaceMembers,
    showSectionHeadings:
      projectTeammates.length > 0 && otherWorkspaceMembers.length > 0,
  };
}

/** Flat list for menus that hide section headings. */
export function flatReviewerPickerList(sections: ReviewerPickerSections): ReviewerPickerPerson[] {
  if (sections.showSectionHeadings) {
    return [...sections.projectTeammates, ...sections.otherWorkspaceMembers];
  }
  if (sections.projectTeammates.length > 0) {
    return sections.projectTeammates;
  }
  return sections.otherWorkspaceMembers;
}
