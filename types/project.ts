export type ProjectStatus = "active" | "paused" | "complete";

export type Project = {
  id: string;
  name: string;
  client: string | null;
  description: string | null;
  status: ProjectStatus;
  created_at: string;
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
};

export type ProjectReference = {
  id: string;
  project_id: string;
  label: string;
  url: string | null;
  file_name: string | null;
  created_at: string;
};
