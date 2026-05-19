export function getRoleHeading(role: string): string {
  const r = role.toLowerCase();
  if (
    r.includes("lead") ||
    r.includes("director") ||
    r.includes("head") ||
    r.includes("principal")
  ) {
    return "As a design leader, what type of work does your team do?";
  }
  if (r.includes("research")) {
    return "As a researcher, what kind of work do you focus on?";
  }
  if (r.includes("freelance") || r.includes("consultant")) {
    return "As a freelancer, what type of work do you take on?";
  }
  return "What type of design work do you do?";
}
