export type Tenant = {
  id: string;
  slug: string;
  name: string;
};

export type MembershipRole = "owner" | "admin" | "member";

export type TenantMembership = {
  tenantId: string;
  userId: string;
  role: MembershipRole;
};

