'use server';

import Anthropic from '@anthropic-ai/sdk';

const MODEL =
  process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';

const GENERATE_SYSTEM_PROMPT =
  'Write a review focus statement for stakeholders based on these artifact descriptions and review type. 2-3 plain sentences. No markdown, no bullet points, no headers.';

const OPTIMISE_SYSTEM_PROMPT =
  'You are a copy editor. Fix grammar and spelling only. Do not change the structure, content, meaning, or length of the text. Do not rewrite sentences. Return ONLY the improved version of the text. If the text requires no changes, return the original text exactly as provided. Never add commentary, explanations, parenthetical notes, or meta-text about the quality of the original. Output only the final text, nothing else.';

function looksLikeOptimiseMetaCommentary(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return (
    trimmed.startsWith('(') ||
    /no corrections/i.test(trimmed) ||
    /already grammatically/i.test(trimmed) ||
    /no changes needed/i.test(trimmed)
  );
}

export type ReviewFocusArtifactContext = {
  name: string;
  description: string;
};

export type GenerateReviewFocusInput = {
  artifactDescriptions: string[];
  artifactContext?: ReviewFocusArtifactContext[];
  reviewType: 'Approval' | 'Comparison';
  projectName?: string;
  selectedProblems?: string[];
  selectedTradeoffs?: string[];
  /** When set, run grammar/clarity pass only (omit full artifact-based generation). */
  existingContent?: string;
};

export async function generateReviewFocus(
  input: GenerateReviewFocusInput,
): Promise<{ ok: true; focus: string } | { ok: false; error: string }> {
  const existingTrimmed = input.existingContent?.trim() ?? '';
  const isOptimise = existingTrimmed.length > 0;

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      '[generateReviewFocus] ANTHROPIC_API_KEY is missing or empty. Set it in .env.local and restart the dev server.',
    );
    return { ok: false, error: 'AI is not configured.' };
  }

  const client = new Anthropic({ apiKey });

  let system: string;
  let userPrompt: string;

  if (isOptimise) {
    system = OPTIMISE_SYSTEM_PROMPT;
    userPrompt = `Fix the grammar and spelling in the following text:\n\n${existingTrimmed}`;
  } else {
    system = GENERATE_SYSTEM_PROMPT;

    const artifactLines =
      (input.artifactContext ?? []).length > 0
        ? (input.artifactContext ?? []).map((artifact, i) => {
            const name = artifact.name.trim() || 'Untitled';
            const description = artifact.description.trim() || '(no description)';
            return `${i + 1}. ${name}: ${description}`;
          })
        : input.artifactDescriptions.map(
            (d, i) => `${i + 1}. ${d.trim() || '(no description)'}`,
          );
    const descriptionBlock = artifactLines.join('\n');

    const problems = (input.selectedProblems ?? [])
      .map((p) => p.trim())
      .filter(Boolean);
    const tradeoffs = (input.selectedTradeoffs ?? [])
      .map((t) => t.trim())
      .filter(Boolean);

    const contextLines: string[] = [];
    if (problems.length > 0) {
      contextLines.push(
        `The following problems have been identified: ${problems.join('; ')}.`,
      );
    }
    if (tradeoffs.length > 0) {
      contextLines.push(
        `The following tradeoffs have been noted: ${tradeoffs.join('; ')}.`,
      );
    }
    if (contextLines.length > 0) {
      contextLines.push('Use these to inform the review focus.');
    }
    const contextBlock =
      contextLines.length > 0 ? `\n${contextLines.join(' ')}` : '';

    userPrompt = `Write a review focus statement for stakeholders.
- Review type: ${input.reviewType}
- Project: ${input.projectName?.trim() || '(unspecified)'}
- Artifact descriptions:
${descriptionBlock || '(none)'}${contextBlock}`;
  }

  let msg: Awaited<ReturnType<Anthropic['messages']['create']>>;
  try {
    msg = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system,
      messages: [{ role: 'user', content: userPrompt }],
    });
  } catch (error) {
    console.error('[AI Review Focus] Error:', error);
    const message = error instanceof Error ? error.message : 'Request failed.';
    return { ok: false, error: message };
  }

  const block = msg.content.find((b) => b.type === 'text');
  const rawFocus = block?.type === 'text' ? block.text.trim() : '';
  const focus =
    isOptimise && looksLikeOptimiseMetaCommentary(rawFocus)
      ? existingTrimmed
      : rawFocus;

  if (!focus) {
    return { ok: false, error: 'Empty response from AI.' };
  }

  return { ok: true, focus };
}
