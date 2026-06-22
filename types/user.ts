export type User = {
  id: string;
  name: string;
  email?: string | null;
  /** Auth user id when linked — used for reviewer picker deduplication only. */
  userId?: string | null;
  /** True when invited but has not signed in yet. */
  isPending?: boolean;
  /** Profile image URL when available */
  avatarUrl?: string | null;
};
