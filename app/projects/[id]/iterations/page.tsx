import { redirect } from "next/navigation";

/** Legacy route: Versions / iterations tab removed; use Artifacts. */
export default function ProjectIterationsRedirectPage({
  params,
}: Readonly<{
  params: { id: string };
}>) {
  redirect(`/projects/${params.id}/artifacts`);
}
