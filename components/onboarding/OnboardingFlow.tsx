"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { AuthMark } from "@/components/auth/AuthMark";
import { Button, Input, Select, Textarea } from "@/components/ui/ds";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { generateInviteCode } from "@/lib/workspace/utils";
import { ensureContributorProfile } from "@/lib/workspace/ensureContributorProfile";
import { getActiveWorkspaceIdFromUser } from "@/lib/workspace/activeWorkspace";
import {
  acceptWorkspaceInvite,
  fetchInviteDetails,
  INVITE_CODE_STORAGE_KEY,
} from "@/lib/workspace/invite-client";
import { InputLockIcon } from "@/components/auth/InputLockIcon";
import { DESIGN_WORK_OPTIONS, WORK_ENV_OPTIONS } from "./constants";
import { DesignTraceName } from "./DesignTraceName";
import { getRoleHeading } from "./getRoleHeading";
import { IntroSlides } from "./IntroSlides";
import "./onboarding.css";

type Phase = "intro" | "steps";
type WorkspaceMode = "create" | "join";

const WORKSPACE_CARD_SHADOW_HOVER =
  "0 2px 8px rgba(107, 30, 46, 0.08), 0 1px 3px rgba(107, 30, 46, 0.06)";
const WORKSPACE_CARD_TRANSITION = "box-shadow 150ms ease, border-color 150ms ease";

function workspaceCardStyle(isSelected: boolean, isHovered: boolean): React.CSSProperties {
  if (isSelected) {
    return {
      background: "var(--brand-accent-subtle, #fff6d7)",
      borderColor: "var(--brand-accent-hover, #e5c820)",
      transition: WORKSPACE_CARD_TRANSITION,
      cursor: "pointer",
    };
  }
  return {
    background: "#ffffff",
    borderColor: isHovered ? "#d4cdc6" : "var(--border-default, #e4ddd3)",
    boxShadow: isHovered ? WORKSPACE_CARD_SHADOW_HOVER : undefined,
    transition: WORKSPACE_CARD_TRANSITION,
    cursor: "pointer",
  };
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return reduced;
}

function firstNameFrom(fullName: string) {
  const trimmed = fullName.trim();
  if (!trimmed) return "";
  return trimmed.split(/\s+/)[0] ?? "";
}

function ProgressBar({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex h-2 w-full shrink-0">
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          className="h-full flex-1"
          style={{
            backgroundColor:
              i < step ? "var(--brand-primary-muted, #e8d0d4)" : "var(--surface-page, #faf8f6)",
          }}
        />
      ))}
    </div>
  );
}

function StepLabel({ step, name }: { step: number; name: string }) {
  return (
    <p
      className="m-0 text-[18px] font-semibold leading-[1.5]"
      style={{ letterSpacing: "-0.27px" }}
    >
      <span style={{ color: "var(--text-heading, #6b1e2e)" }}>Step {step}:</span>
      <span style={{ color: "var(--text-tertiary, #998c82)" }}> {name}</span>
    </p>
  );
}

function LeftHeading({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-0">{children}</div>;
}

function LeftSub({ children }: { children: ReactNode }) {
  return (
    <p
      className="m-0 mt-6"
      style={{
        fontSize: 28,
        fontWeight: 300,
        lineHeight: 1.35,
        letterSpacing: "-0.84px",
        color: "var(--text-secondary, #6b5e55)",
      }}
    >
      {children}
    </p>
  );
}

type OnboardingFlowProps = {
  inviteCode?: string;
  inviteEmail?: string;
};

export function OnboardingFlow({
  inviteCode: urlInviteCode,
  inviteEmail,
}: OnboardingFlowProps = {}) {
  const router = useRouter();
  const reducedMotion = usePrefersReducedMotion();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [isInvited, setIsInvited] = useState(false);
  const [inviteWorkspaceId, setInviteWorkspaceId] = useState<string | null>(null);
  const [inviteWorkspaceName, setInviteWorkspaceName] = useState("your team");
  const [invitedJoinError, setInvitedJoinError] = useState(false);

  const [phase, setPhase] = useState<Phase>("intro");
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);

  const [name, setName] = useState("");
  const [role, setRole] = useState("");
  const [company, setCompany] = useState("");
  const [designType, setDesignType] = useState("");
  const [workEnv, setWorkEnv] = useState("");
  const [designContext, setDesignContext] = useState("");

  const [workspaceMode, setWorkspaceMode] = useState<WorkspaceMode>("create");
  const [workspaceName, setWorkspaceName] = useState("");
  const [inviteLink, setInviteLink] = useState("");
  const [workspaceNameError, setWorkspaceNameError] = useState(false);
  const [inviteLinkError, setInviteLinkError] = useState(false);
  const [hoveredWorkspaceCard, setHoveredWorkspaceCard] = useState<WorkspaceMode | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [email, setEmail] = useState(inviteEmail ?? "");
  const [storedInviteCode, setStoredInviteCode] = useState<string | null>(
    urlInviteCode?.trim() ?? null,
  );

  const [projectName, setProjectName] = useState("");
  const [projectFor, setProjectFor] = useState("");
  const [projectDescription, setProjectDescription] = useState("");

  const totalSteps = isInvited ? 3 : 4;
  const designTypeDisplay = useMemo(() => {
    const opt = DESIGN_WORK_OPTIONS.find((o) => o.value === designType);
    return opt?.label ?? "your work";
  }, [designType]);

  const isInHouseTeam = workEnv === "in-house";

  const roleHeading = useMemo(() => getRoleHeading(role), [role]);

  const firstName = useMemo(() => firstNameFrom(name), [name]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    void (async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.replace("/login");
        return;
      }

      if (user.user_metadata?.onboarding_complete === true) {
        router.replace("/projects");
        return;
      }

      setUserId(user.id);

      if (inviteEmail?.trim()) {
        setEmail(inviteEmail.trim());
      } else if (user.email) {
        setEmail(user.email);
      }

      const localInviteCode =
        typeof window !== "undefined"
          ? window.localStorage.getItem(INVITE_CODE_STORAGE_KEY)?.trim() || null
          : null;
      const effectiveInviteCode = urlInviteCode?.trim() || localInviteCode;

      if (effectiveInviteCode) {
        setStoredInviteCode(effectiveInviteCode);
        setIsInvited(true);
        setInviteLink(effectiveInviteCode);

        const details = await fetchInviteDetails(effectiveInviteCode);
        if (details?.workspace_name) {
          setInviteWorkspaceName(details.workspace_name);
          setCompany(details.workspace_name);
        }
      } else {
        const invitedId = user.user_metadata?.invite_workspace_id as string | undefined;
        if (invitedId) {
          setIsInvited(true);
          setInviteWorkspaceId(invitedId);

          const { data: ws } = await supabase
            .from("workspaces")
            .select("name")
            .eq("id", invitedId)
            .maybeSingle();

          if (ws?.name) setInviteWorkspaceName(ws.name);
        } else if (reducedMotion) {
          setPhase("steps");
        }
      }

      setLoading(false);
    })();
  }, [router, reducedMotion, urlInviteCode, inviteEmail]);

  useEffect(() => {
    if (!loading && !isInvited && reducedMotion && phase === "intro") {
      setPhase("steps");
    }
  }, [loading, isInvited, reducedMotion, phase]);

  useEffect(() => {
    if (step === 4 && !isInHouseTeam && company.trim()) {
      setProjectFor((prev) => prev || company.trim());
    }
  }, [step, isInHouseTeam, company]);

  const persistProfile = useCallback(
    async (options?: {
      workspaceId?: string;
      permissionLevel?: "admin" | "editor" | "reviewer";
    }) => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const designLabel =
        DESIGN_WORK_OPTIONS.find((o) => o.value === designType)?.label ?? "";
      const envLabel = WORK_ENV_OPTIONS.find((o) => o.value === workEnv)?.label ?? "";

      const resolvedWorkspaceId =
        options?.workspaceId ??
        activeWorkspaceId ??
        getActiveWorkspaceIdFromUser(user) ??
        (user?.user_metadata?.workspace_id as string | undefined) ??
        null;

      const trimmedName = name.trim();
      const permissionLevel = options?.permissionLevel ?? "admin";

      await supabase.auth.updateUser({
        data: {
          onboarding_complete: true,
          display_name: trimmedName,
          full_name: trimmedName,
          role: role.trim() || null,
          company: company.trim() || null,
          designer_type: designLabel || null,
          work_environment: envLabel || null,
          design_context: designContext.trim() || null,
          ...(resolvedWorkspaceId
            ? {
                active_workspace_id: resolvedWorkspaceId,
                workspace_id: resolvedWorkspaceId,
              }
            : {}),
        },
      });

      if (user?.id && resolvedWorkspaceId) {
        await ensureContributorProfile(supabase, {
          userId: user.id,
          email: user.email ?? inviteEmail ?? email ?? null,
          displayName: trimmedName,
          role: role.trim() || null,
          activeWorkspaceId: resolvedWorkspaceId,
          permissionLevel,
        });
      }
    },
    [name, role, company, designType, workEnv, designContext, activeWorkspaceId, inviteEmail, email],
  );

  const joinWorkspace = useCallback(
    async (inviteCode: string) => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      const currentUserId = user?.id;
      if (!currentUserId) return { ok: false as const };

      const { data: workspace } = await supabase
        .from("workspaces")
        .select("id, name")
        .eq("invite_code", inviteCode.trim())
        .single();

      if (!workspace) return { ok: false as const };

      const { data: existingMember } = await supabase
        .from("workspace_members")
        .select("id")
        .eq("workspace_id", workspace.id)
        .eq("user_id", currentUserId)
        .maybeSingle();

      if (existingMember) {
        await supabase
          .from("workspace_members")
          .update({ status: "active", joined_at: new Date().toISOString() })
          .eq("workspace_id", workspace.id)
          .eq("user_id", currentUserId);
      } else {
        await supabase.from("workspace_members").insert({
          workspace_id: workspace.id,
          user_id: currentUserId,
          role: "member",
          status: "active",
        });
      }

      await supabase.auth.updateUser({
        data: {
          active_workspace_id: workspace.id,
          workspace_id: workspace.id,
        },
      });

      setActiveWorkspaceId(workspace.id);
      return { ok: true as const, workspace };
    },
    [],
  );

  const handleCreateWorkspace = async () => {
    if (!userId || !workspaceName.trim()) return;
    setSubmitting(true);
    setWorkspaceNameError(false);

    const supabase = createSupabaseBrowserClient();
    const { data: workspace, error: wsError } = await supabase
      .from("workspaces")
      .insert({
        name: workspaceName.trim(),
        invite_code: generateInviteCode(workspaceName),
      })
      .select()
      .single();

    if (wsError || !workspace) {
      setWorkspaceNameError(true);
      setSubmitting(false);
      return;
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();
    const memberUserId = user?.id;

    if (memberUserId) {
      const { error: memberError } = await supabase.from("workspace_members").insert({
        workspace_id: workspace.id,
        user_id: memberUserId,
        role: "admin",
        status: "active",
      });

      if (memberError) {
        console.error("Failed to create workspace admin membership:", memberError);
      }
    }

    await supabase.auth.updateUser({
      data: {
        active_workspace_id: workspace.id,
        workspace_id: workspace.id,
      },
    });

    setActiveWorkspaceId(workspace.id);
    setSubmitting(false);
    setStep(4);
  };

  const handleJoinWorkspace = async () => {
    if (!inviteLink.trim()) return;
    setSubmitting(true);
    setInviteLinkError(false);

    const result = await joinWorkspace(inviteLink);
    if (!result.ok) {
      setInviteLinkError(true);
      setSubmitting(false);
      return;
    }

    try {
      await persistProfile();
      router.push("/projects");
    } finally {
      setSubmitting(false);
    }
  };

  const handleInvitedJoin = async () => {
    setSubmitting(true);
    setInvitedJoinError(false);

    const inviteCode =
      storedInviteCode?.trim() ||
      urlInviteCode?.trim() ||
      (typeof window !== "undefined"
        ? window.localStorage.getItem(INVITE_CODE_STORAGE_KEY)?.trim()
        : null);

    if (!inviteCode) {
      setInvitedJoinError(true);
      setSubmitting(false);
      return;
    }

    try {
      const result = await acceptWorkspaceInvite(inviteCode);
      if (!result.success || !result.workspace_id) {
        setInvitedJoinError(true);
        return;
      }

      await persistProfile({
        workspaceId: result.workspace_id,
        permissionLevel: "reviewer",
      });

      window.localStorage.removeItem(INVITE_CODE_STORAGE_KEY);
      router.push("/projects");
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateProject = async (skip: boolean) => {
    setSubmitting(true);
    try {
      const supabase = createSupabaseBrowserClient();

      if (!skip && projectName.trim() && activeWorkspaceId) {
        await supabase.from("projects").insert({
          name: projectName.trim(),
          description: projectDescription.trim() || null,
          client: projectFor.trim() || null,
          workspace_id: activeWorkspaceId,
          status: "active",
        });
      }

      await persistProfile();
      router.push("/projects");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <main
        className="flex min-h-screen w-full items-center justify-center"
        style={{ background: "var(--surface-page, #faf8f6)" }}
      >
        <AuthMark />
      </main>
    );
  }

  if (phase === "intro") {
    return (
      <IntroSlides
        reducedMotion={reducedMotion}
        onComplete={() => setPhase("steps")}
      />
    );
  }

  const invitedConfirmationStep = isInvited && step === 3;

  return (
    <main className="onboarding-steps-enter relative flex min-h-screen w-screen flex-col overflow-hidden">
      {invitedConfirmationStep ? (
        <div
          style={{
            position: "absolute",
            left: "50%",
            top: "50%",
            right: 0,
            height: 0,
            borderTop: "2px dashed #e4ddd3",
            transform: "translateY(-50%)",
            pointerEvents: "none",
            zIndex: 0,
          }}
          aria-hidden
        />
      ) : null}
      <div className="flex min-h-0 flex-1 w-full">
      <div
        className="relative z-[1] flex min-h-screen w-1/2 shrink-0 flex-col items-center justify-center px-16"
        style={{ background: "var(--surface-page, #faf8f6)" }}
      >
        <AuthMark
          className={`absolute left-16 ${isInvited ? "top-0" : "top-16"}`}
          height={48}
        />

        <div className="w-full">
          {step === 1 && (
            <>
              <LeftHeading>
                <h1
                  className="m-0"
                  style={{
                    fontSize: 48,
                    lineHeight: 1.15,
                    letterSpacing: "-1.44px",
                    color: "var(--text-heading, #6b1e2e)",
                  }}
                >
                  <span style={{ fontWeight: 800 }}>Now let&apos;s set up your </span>
                  <br />
                  <span style={{ fontWeight: 300, color: "#a0384f" }}>personal details</span>
                </h1>
              </LeftHeading>
              <LeftSub>Tell us a little about you and your work.</LeftSub>
            </>
          )}

          {step === 2 && (
            <>
              <LeftHeading>
                <h1
                  className="m-0 font-extrabold"
                  style={{
                    fontSize: 48,
                    lineHeight: 1.15,
                    letterSpacing: "-1.44px",
                    color: "var(--text-heading, #6b1e2e)",
                  }}
                >
                  {isInvited ? (
                    <>
                      <span style={{ fontWeight: 800 }}>Hi </span>
                      <span style={{ fontWeight: 300, color: "#a0384f" }}>
                        {firstName || "there"}!
                      </span>
                    </>
                  ) : (
                    roleHeading
                  )}
                </h1>
              </LeftHeading>
              <LeftSub>
                What type of work do you do? This helps us tailor your{" "}
                <DesignTraceName /> experience.
              </LeftSub>
            </>
          )}

          {step === 3 && !isInvited && (
            <>
              <LeftHeading>
                <h1
                  className="m-0"
                  style={{
                    fontSize: 48,
                    lineHeight: 1.15,
                    letterSpacing: "-1.44px",
                    color: "var(--text-heading, #6b1e2e)",
                  }}
                >
                  <span style={{ fontWeight: 800 }}>Ok, perfect — a workspace</span>
                  <br />
                  <span style={{ fontWeight: 800 }}>for </span>
                  <span style={{ fontWeight: 300, color: "#a0384f" }}>{designTypeDisplay}</span>
                </h1>
              </LeftHeading>
              <LeftSub>
                Do you have an existing <DesignTraceName /> workspace to connect to, or would you
                like to create a new one?
              </LeftSub>
            </>
          )}

          {step === 3 && isInvited && (
            <>
              <LeftHeading>
                <h1
                  className="m-0"
                  style={{
                    margin: 0,
                    fontSize: 48,
                    fontWeight: 400,
                    lineHeight: 1.15,
                    letterSpacing: "-1.44px",
                    color: "#6b1e2e",
                  }}
                >
                  <span style={{ fontWeight: 800 }}>You&apos;ve been invited to join </span>
                  <br />
                  <span style={{ fontWeight: 400 }}>{inviteWorkspaceName}</span>
                </h1>
              </LeftHeading>
              <LeftSub>
                Your team is already building a shared design memory. Join the workspace to access
                projects, reviews, feedback and decisions.
              </LeftSub>
              <div className="mt-10 flex flex-col items-start gap-3">
                {invitedJoinError ? (
                  <p
                    className="m-0 text-[12px] leading-[1.5]"
                    style={{ color: "var(--text-error, #b91c1c)" }}
                  >
                    This invite link is not valid or has expired.
                  </p>
                ) : null}
                <Button
                  variant="accent"
                  size="lg"
                  label={submitting ? "Joining..." : "Let's Go!"}
                  disabled={submitting}
                  onClick={() => void handleInvitedJoin()}
                  className="w-fit"
                  style={{ width: "fit-content" }}
                />
              </div>
            </>
          )}

          {step === 4 && (
            <>
              <LeftHeading>
                <h1
                  className="m-0"
                  style={{
                    fontSize: 48,
                    fontWeight: 800,
                    lineHeight: 1.15,
                    letterSpacing: "-1.44px",
                    color: "var(--text-heading, #6b1e2e)",
                  }}
                >
                  Let&apos;s set up your first project
                </h1>
              </LeftHeading>
              <LeftSub>
                Projects give you a way to group all your reviews together and assign your
                teammates.
              </LeftSub>
            </>
          )}
        </div>
      </div>

      {invitedConfirmationStep ? (
        <div
          className="flex w-1/2 min-h-screen flex-col"
          style={{ background: "var(--surface-page, #faf8f6)" }}
        >
          <ProgressBar step={step} total={totalSteps} />
        </div>
      ) : (
        <div className="flex w-1/2 min-h-screen flex-col bg-white">
          <ProgressBar step={step} total={totalSteps} />

          <div className="flex flex-1 flex-col justify-between px-8 py-8">
            <div className="flex flex-col gap-6">
              {step === 1 && (
                <>
                  <StepLabel step={1} name="Personal Details" />
                  <div className="flex w-full flex-col gap-6">
                    <Input
                      label="Name"
                      size="lg"
                      placeholder="Your name"
                      autoComplete="name"
                      required
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="w-full"
                    />
                    <Input
                      label="Role"
                      size="lg"
                      placeholder="i.e. Product Designer or Design Lead"
                      helperText="This helps DesignTrace tailor language, prompts, and review support to your role."
                      showHelper
                      value={role}
                      onChange={(e) => setRole(e.target.value)}
                      className="w-full"
                    />
                    {isInvited ? (
                      <Input
                        label="Company or Team Name"
                        size="lg"
                        value={company || inviteWorkspaceName}
                        disabled
                        trailingAction={<InputLockIcon />}
                        helperText="You're joining this workspace as a member."
                        showHelper
                        onChange={() => {}}
                        className="w-full"
                      />
                    ) : (
                      <Input
                        label="Company or Team Name"
                        size="lg"
                        placeholder="i.e. Acme"
                        value={company}
                        onChange={(e) => setCompany(e.target.value)}
                        className="w-full"
                      />
                    )}
                  </div>
                </>
              )}

              {step === 2 && (
                <>
                  <StepLabel step={2} name="Designer type" />
                  <div className="flex w-full flex-col gap-6">
                    <Select
                      label="What kind of design work do you do?"
                      size="lg"
                      className="w-full"
                      options={[...DESIGN_WORK_OPTIONS]}
                      value={designType}
                      onChange={setDesignType}
                      placeholder="Select an option"
                    />
                    <Select
                      label="What environment do you usually work in?"
                      size="lg"
                      className="w-full"
                      options={[...WORK_ENV_OPTIONS]}
                      value={workEnv}
                      onChange={setWorkEnv}
                      placeholder="Select an option"
                    />
                    <Textarea
                      label="Tell us a little more about your design context"
                      size="lg"
                      className="w-full"
                      placeholder="For example, I work across multiple squads, I'm the only designer in my team, or I support early-stage product work."
                      value={designContext}
                      onChange={(e) => setDesignContext(e.target.value)}
                      fieldShellOuterClassName="[&_textarea]:min-h-[120px]"
                    />
                  </div>
                </>
              )}

              {step === 3 && !isInvited && (
                <>
                  <StepLabel step={3} name="Workspace setup" />
                  <div className="flex w-full flex-col gap-4">
                    <button
                      type="button"
                      className="w-full rounded-lg border p-4 text-left"
                      style={workspaceCardStyle(
                        workspaceMode === "create",
                        hoveredWorkspaceCard === "create",
                      )}
                      onMouseEnter={() => setHoveredWorkspaceCard("create")}
                      onMouseLeave={() => setHoveredWorkspaceCard(null)}
                      onClick={() => {
                        setWorkspaceMode("create");
                        setInviteLinkError(false);
                      }}
                    >
                      <p
                        className="m-0 text-[16px] font-semibold"
                        style={{ color: "var(--text-heading, #6b1e2e)" }}
                      >
                        Create a new workspace
                      </p>
                      <p
                        className="m-0 mt-1 text-[12px]"
                        style={{ color: "var(--text-secondary, #6b5e55)" }}
                      >
                        Start fresh with your own projects and decisions.
                      </p>
                      <div className="mt-4" onClick={(e) => e.stopPropagation()}>
                        <Input
                          label="Workspace name"
                          size="sm"
                          placeholder="i.e. Acme Design Team"
                          value={workspaceName}
                          error={workspaceNameError}
                          errorMessage="Couldn't create workspace. Please try a different name."
                          onChange={(e) => {
                            setWorkspaceName(e.target.value);
                            setWorkspaceNameError(false);
                          }}
                          className="w-full"
                        />
                      </div>
                    </button>

                    <button
                      type="button"
                      className="w-full rounded-lg border p-4 text-left"
                      style={workspaceCardStyle(
                        workspaceMode === "join",
                        hoveredWorkspaceCard === "join",
                      )}
                      onMouseEnter={() => setHoveredWorkspaceCard("join")}
                      onMouseLeave={() => setHoveredWorkspaceCard(null)}
                      onClick={() => {
                        setWorkspaceMode("join");
                        setWorkspaceNameError(false);
                      }}
                    >
                      <p
                        className="m-0 text-[16px] font-semibold"
                        style={{
                          color:
                            workspaceMode === "join"
                              ? "var(--text-on-accent, #2a221b)"
                              : "var(--text-heading, #6b1e2e)",
                        }}
                      >
                        Join an existing workspace
                      </p>
                      <p
                        className="m-0 mt-1 text-[13px]"
                        style={{ color: "var(--text-secondary, #6b5e55)" }}
                      >
                        Connect to a team or organisation already using <DesignTraceName />.
                      </p>
                      <div className="mt-4" onClick={(e) => e.stopPropagation()}>
                        <Input
                          label="Workspace invite link"
                          size="sm"
                          placeholder="i.e. Acme-Design-Team 123"
                          value={inviteLink}
                          error={inviteLinkError}
                          errorMessage="This invite link is not valid or has expired."
                          onChange={(e) => {
                            setInviteLink(e.target.value);
                            setInviteLinkError(false);
                          }}
                          className="w-full"
                        />
                      </div>
                    </button>
                  </div>
                </>
              )}

              {step === 4 && (
                <>
                  <StepLabel step={4} name="Create first project" />
                  <div className="flex w-full flex-col gap-3">
                    <Input
                      label="Project name"
                      size="sm"
                      placeholder="i.e. Website Redesign"
                      required
                      value={projectName}
                      onChange={(e) => setProjectName(e.target.value)}
                      className="w-full"
                    />
                    {!isInHouseTeam ? (
                      <Input
                        label="Who is the project for?"
                        size="sm"
                        placeholder="Enter a client name or mark as internal"
                        value={projectFor}
                        onChange={(e) => setProjectFor(e.target.value)}
                        className="w-full"
                      />
                    ) : null}
                    <Textarea
                      label="Project Description"
                      size="sm"
                      className="w-full"
                      placeholder="A brief overview of the project goals..."
                      value={projectDescription}
                      onChange={(e) => setProjectDescription(e.target.value)}
                      fieldShellOuterClassName="[&_textarea]:min-h-[91px]"
                    />
                  </div>
                </>
              )}
            </div>

            <div className="mt-8 w-full shrink-0">
              {step === 1 && (
                <Button
                  variant="primary"
                  size="lg"
                  label="Next"
                  icon="trailing"
                  iconName="chevron-right"
                  disabled={!name.trim() || submitting}
                  onClick={() => setStep(2)}
                  className="w-full"
                  style={{ width: "100%" }}
                />
              )}

              {step === 2 && (
                <div className="flex w-full gap-[10px]">
                  <Button
                    variant="secondary"
                    size="lg"
                    label="Skip"
                    disabled={submitting}
                    onClick={() => setStep(3)}
                    className="flex-1"
                    style={{ flex: 1 }}
                  />
                  <Button
                    variant="primary"
                    size="lg"
                    label="Next"
                    icon="trailing"
                    iconName="chevron-right"
                    disabled={submitting}
                    onClick={() => setStep(3)}
                    className="flex-1"
                    style={{ flex: 1 }}
                  />
                </div>
              )}

              {step === 3 && !isInvited && workspaceMode === "create" && (
                <Button
                  variant="primary"
                  size="lg"
                  label="Create your first project"
                  icon="trailing"
                  iconName="chevron-right"
                  disabled={!workspaceName.trim() || submitting}
                  onClick={() => void handleCreateWorkspace()}
                  className="w-full"
                  style={{ width: "100%" }}
                />
              )}

              {step === 3 && !isInvited && workspaceMode === "join" && (
                <Button
                  variant="primary"
                  size="lg"
                  label="Go to workspace"
                  icon="trailing"
                  iconName="chevron-right"
                  disabled={!inviteLink.trim() || submitting}
                  onClick={() => void handleJoinWorkspace()}
                  className="w-full"
                  style={{ width: "100%" }}
                />
              )}

              {step === 4 && (
                <div className="flex w-full gap-[10px]">
                  <Button
                    variant="secondary"
                    size="lg"
                    label="Skip"
                    disabled={submitting}
                    onClick={() => void handleCreateProject(true)}
                    className="flex-1"
                    style={{ flex: 1 }}
                  />
                  <Button
                    variant="accent"
                    size="lg"
                    label="Create Project"
                    disabled={!projectName.trim() || submitting}
                    onClick={() => void handleCreateProject(false)}
                    className="flex-1"
                    style={
                      projectName.trim()
                        ? {
                            flex: 1,
                            backgroundColor: "#ffe96c",
                            borderColor: "#ffe96c",
                            color: "#2a221b",
                          }
                        : { flex: 1 }
                    }
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      </div>
    </main>
  );
}
