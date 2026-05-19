export const DESIGN_WORK_OPTIONS = [
  { value: "product-design", label: "Product Design" },
  { value: "ux-research", label: "UX Research" },
  { value: "service-design", label: "Service Design" },
  { value: "design-systems", label: "Design Systems" },
  { value: "brand-design", label: "Brand Design" },
  { value: "marketing-design", label: "Marketing Design" },
  { value: "design-strategy", label: "Design Strategy" },
  { value: "other", label: "Other" },
] as const;

export const WORK_ENV_OPTIONS = [
  { value: "in-house", label: "In-house product team" },
  { value: "freelance", label: "Freelance" },
  { value: "agency", label: "Agency" },
  { value: "consultant", label: "Consultant" },
  { value: "founder", label: "Founder / Startup" },
  { value: "student", label: "Student / Early career" },
] as const;
