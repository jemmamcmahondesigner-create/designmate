export type ProjectStatus = "active" | "paused" | "complete";

export type Project = {
  id: string;
  name: string;
  client: string | null;
  description: string | null;
  status: ProjectStatus;
  created_at: string;
  /** Project teammates for cards and client-side search. */
  contributors: ProjectContributor[];
  /** @deprecated Derived from `contributors` — use for search indexing only. */
  contributor_names: string[];
};

export type ProjectsByStatus = {
  active: Project[];
  paused: Project[];
  complete: Project[];
};

export type ProjectProblem = {
  id: string;
  description: string;
};

export type ProjectContributor = {
  id: string;
  name: string;
  email: string | null;
  role: string | null;
  userId?: string | null;
  /** Profile image URL when available */
  avatarUrl?: string | null;
};

export type ProjectReference = {
  id: string;
  project_id: string;
  label: string;
  url: string | null;
  file_name: string | null;
  storage_path: string | null;
  file_type: string | null;
  created_at: string;
};
