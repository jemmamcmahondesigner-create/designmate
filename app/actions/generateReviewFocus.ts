'use server';

import Anthropic from '@anthropic-ai/sdk';

const MODEL =
  process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';

const GENERATE_SYSTEM_PROMPT =
  'Write a review focus statement for stakeholders based on these artifact descriptions and review type. 2-3 plain sentences. No markdown, no bullet points, no headers.';

const OPTIMISE_SYSTEM_PROMPT =
  'You are a copy editor. Fix grammar and spelling only. Do not change the structure, content, meaning, or length of the text. Do not rewrite sentences. Return only the corrected text with no explanation.';

export type GenerateReviewFocusInput = {
  artifactDescriptions: string[];
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

  console.log('[AI Review Focus] Called with:', {
    mode: isOptimise ? 'optimise' : 'generate',
    descriptionsCount: input.artifactDescriptions.length,
    reviewType: input.reviewType,
    projectName: input.projectName,
    problemsCount: input.selectedProblems?.length ?? 0,
    tradeoffsCount: input.selectedTradeoffs?.length ?? 0,
    existingLen: existingTrimmed.length,
  });
  console.log(
    '[AI Review Focus] API key present:',
    !!process.env.ANTHROPIC_API_KEY,
  );

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

    const descriptionBlock = input.artifactDescriptions
      .map((d, i) => `${i + 1}. ${d.trim() || '(no description)'}`)
      .join('\n');

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
  const focus = block?.type === 'text' ? block.text.trim() : '';

  if (!focus) {
    return { ok: false, error: 'Empty response from AI.' };
  }

  console.log('[AI Review Focus] Result:', focus);

  return { ok: true, focus };
}
