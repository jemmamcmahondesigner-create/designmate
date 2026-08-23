'use server';

import Anthropic from '@anthropic-ai/sdk';
import { getMajorVersion } from '@/lib/artifacts/versioning';

const MODEL =
  process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';

const SYSTEM_PROMPT =
  "Generate a concise design review title (maximum 60 characters, no quotes or punctuation at the end). Prefer the Figma frame or section name over generic terms like 'Concept 1'. Do not include the review type name in the title. Match the review-type framing given in the user message. Align and critique titles must NOT use approval or sign-off language. Return only the title string.";

export type SuggestedReviewType = 'align' | 'critique' | 'compare' | 'approve';

export type ReviewTitleReviewType =
  | 'approve'
  | 'compare'
  | 'align'
  | 'critique';

/** Same framing the product shows under the Review type select (and generateReviewFocus). */
const REVIEW_TYPE_TITLE_FRAMING: Record<ReviewTitleReviewType, string> = {
  align:
    'Share early direction for high-level input. Reviewers indicate if the work is heading in the right direction. Do NOT use approval, sign-off, or decision language.',
  compare:
    'Present multiple options for stakeholders to choose between. Ask reviewers to weigh options and indicate a preference.',
  critique:
    'Request detailed feedback on specific aspects of the work. Reviewers summarise their comments from Figma or other tools. This is not a decision point — do NOT use approval, sign-off, or preference language.',
  approve:
    'Reviewers sign off on individual artifacts or request changes before work progresses. Frame as seeking sign-off/approval on the work.',
};

export type GenerateReviewTitleInput = {
  /** Figma frame or section labels (preferred) or user-typed artifact names as fallback. */
  artifactNames: string[];
  reviewType: ReviewTitleReviewType;
  /** Per-artifact context used to deterministically derive `suggestedReviewType`. */
  artifactContext?: {
    /** Stored version label (e.g. `v1`, `v2.1`). */
    versionNumber: string;
    /** True when this artifact is linked to an existing canonical artifact (i.e. has a related prior artifact). */
    hasRelatedArtifact: boolean;
  }[];
  /** True if the parent project already has artifacts from prior reviews. */
  priorReviewsExist?: boolean;
};

/**
 * Deterministic heuristic for the suggested review type based on the artifact
 * context the user has assembled. The LLM only authors the title string; this
 * function picks the type so we can guarantee one of the four enum values is
 * returned without parsing free-form model output.
 *
 * Priority:
 *  1. 2+ artifacts AND prior reviews exist  → approve
 *  2. 2+ artifacts                          → compare
 *  3. Any artifact v2+ AND any related      → critique
 *  4. All artifacts v1 AND none related     → align
 *  5. Default                               → align
 */
function deriveSuggestedReviewType(
  context: NonNullable<GenerateReviewTitleInput['artifactContext']>,
  priorReviewsExist: boolean,
): SuggestedReviewType {
  const count = context.length;
  if (count >= 2 && priorReviewsExist) return 'approve';
  if (count >= 2) return 'compare';
  const anyV2Plus = context.some((a) => getMajorVersion(a.versionNumber) >= 2);
  const anyRelated = context.some((a) => a.hasRelatedArtifact);
  if (anyV2Plus && anyRelated) return 'critique';
  if (!anyV2Plus && !anyRelated) return 'align';
  return 'align';
}

export async function generateReviewTitle(
  input: GenerateReviewTitleInput,
): Promise<
  | { ok: true; title: string; suggestedReviewType: SuggestedReviewType }
  | { ok: false; error: string }
> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      '[generateReviewTitle] ANTHROPIC_API_KEY is missing or empty. Set it in .env.local and restart the dev server.',
    );
    return { ok: false, error: 'AI is not configured.' };
  }

  const suggestedReviewType = deriveSuggestedReviewType(
    input.artifactContext ?? [],
    input.priorReviewsExist ?? false,
  );

  const namesLine = input.artifactNames
    .map((n) => n.trim())
    .filter(Boolean)
    .join(', ');

  const typeFraming =
    REVIEW_TYPE_TITLE_FRAMING[input.reviewType] ??
    REVIEW_TYPE_TITLE_FRAMING.approve;

  const userPrompt = `Generate a concise design review title (maximum 60 characters, no quotes or punctuation at the end). Use the following context:
- Figma frame or section labels: ${namesLine || '(none)'}
- Review type: ${input.reviewType}
- Review type framing (follow this; match tone and purpose exactly): ${typeFraming}
Prefer the Figma frame or section name over generic terms like 'Concept 1'. Do not include the review type name in the title. Return only the title string.`;

  const client = new Anthropic({ apiKey });

  let msg: Awaited<ReturnType<Anthropic['messages']['create']>>;
  try {
    msg = await client.messages.create({
      model: MODEL,
      max_tokens: 128,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });
  } catch (error) {
    console.error('[AI Review Title] Error:', error);
    const message = error instanceof Error ? error.message : 'Request failed.';
    return { ok: false, error: message };
  }

  const block = msg.content.find((b) => b.type === 'text');
  const raw = block?.type === 'text' ? block.text.trim() : '';
  // Strip surrounding quotes/backticks/punctuation that the model may add despite the prompt.
  const cleaned = raw
    .replace(/^["'`“”‘’\s]+|["'`“”‘’\s]+$/g, '')
    .replace(/[.!?;:]+$/g, '')
    .trim();
  const title = cleaned.slice(0, 60).trim();

  if (!title) {
    return { ok: false, error: 'Empty response from AI.' };
  }

  return { ok: true, title, suggestedReviewType };
}
