export type User = {
  id: string;
  name: string;
  email?: string | null;
  /** Profile image URL when available */
  avatarUrl?: string | null;
};
