'use server';

import Anthropic from '@anthropic-ai/sdk';

const MODEL =
  process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';

const OPTIMISE_SYSTEM_PROMPT =
  'You are a copy editor. Fix grammar and spelling only. Do not change the structure, content, meaning, or length. Return ONLY the improved version of the text. If the text requires no changes, return the original text exactly as provided. Never add commentary, explanations, parenthetical notes, or meta-text about the quality of the original. Output only the final text, nothing else.';

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

export type GenerateArtifactDescriptionInput = {
  existingContent: string;
};

export async function generateArtifactDescription(
  input: GenerateArtifactDescriptionInput,
): Promise<{ ok: true; description: string } | { ok: false; error: string }> {
  const existingTrimmed = input.existingContent.trim();
  if (!existingTrimmed) {
    return { ok: false, error: 'No content to optimise' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      '[generateArtifactDescription] ANTHROPIC_API_KEY is missing or empty. Set it in .env.local and restart the dev server.',
    );
    return { ok: false, error: 'AI is not configured.' };
  }

  const userPrompt = `Fix the grammar and spelling in the following text:\n\n${existingTrimmed}`;

  const client = new Anthropic({ apiKey });

  let msg: Awaited<ReturnType<Anthropic['messages']['create']>>;
  try {
    msg = await client.messages.create({
      model: MODEL,
      max_tokens: 512,
      system: OPTIMISE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });
  } catch (error) {
    console.error('[AI Description] Error:', error);
    const message = error instanceof Error ? error.message : 'Request failed.';
    return { ok: false, error: message };
  }

  const block = msg.content.find((b) => b.type === 'text');
  const rawDescription = block?.type === 'text' ? block.text.trim() : '';
  const description = looksLikeOptimiseMetaCommentary(rawDescription)
    ? existingTrimmed
    : rawDescription;

  if (!description) {
    return { ok: false, error: 'Empty response from AI.' };
  }

  return { ok: true, description };
}
