'use server';

import Anthropic from '@anthropic-ai/sdk';

const MODEL =
  process.env.ANTHROPIC_MODEL ?? 'claude-sonnet-4-5';

const SYSTEM_PROMPT =
  "Identify 2-3 key design tradeoffs between these two artifacts. Return only a JSON array with objects containing: description (string), severity ('High' | 'Medium' | 'Low'), artifactLabel (the label of the artifact this tradeoff applies to). No markdown, no explanation.";

export type TradeoffSeverity = 'High' | 'Medium' | 'Low';

export type Tradeoff = {
  description: string;
  severity: TradeoffSeverity;
  artifactLabel: string;
};

export type GenerateTradeoffsInput = {
  artifactDescriptions: [string, string];
  artifactLabels: [string, string];
};

const ALLOWED_SEVERITY: ReadonlySet<TradeoffSeverity> = new Set([
  'High',
  'Medium',
  'Low',
]);

function coerceSeverity(value: unknown): TradeoffSeverity {
  if (typeof value === 'string') {
    const cap = value.trim().toLowerCase();
    if (cap === 'high') return 'High';
    if (cap === 'medium') return 'Medium';
    if (cap === 'low') return 'Low';
    if (ALLOWED_SEVERITY.has(value as TradeoffSeverity)) {
      return value as TradeoffSeverity;
    }
  }
  return 'Medium';
}

function parseTradeoffs(raw: string, labels: [string, string]): Tradeoff[] {
  // Strip code fences if the model wrapped JSON in markdown despite the prompt.
  const cleaned = raw
    .trim()
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim();

  let parsed: unknown;
  try {
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const allowedLabels = new Set(labels.map((l) => l.trim()).filter(Boolean));

  const out: Tradeoff[] = [];
  for (const entry of parsed) {
    if (!entry || typeof entry !== 'object') continue;
    const e = entry as Record<string, unknown>;
    const description =
      typeof e.description === 'string' ? e.description.trim() : '';
    if (!description) continue;
    const severity = coerceSeverity(e.severity);
    const labelRaw =
      typeof e.artifactLabel === 'string' ? e.artifactLabel.trim() : '';
    const artifactLabel = allowedLabels.has(labelRaw)
      ? labelRaw
      : labels[0]?.trim() ?? '';
    out.push({ description, severity, artifactLabel });
  }
  return out.slice(0, 3);
}

export async function generateTradeoffs(
  input: GenerateTradeoffsInput,
): Promise<
  { ok: true; tradeoffs: Tradeoff[] } | { ok: false; error: string }
> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    console.error(
      '[generateTradeoffs] ANTHROPIC_API_KEY is missing or empty. Set it in .env.local and restart the dev server.',
    );
    return { ok: false, error: 'AI is not configured.' };
  }

  const [labelA, labelB] = input.artifactLabels;
  const [descA, descB] = input.artifactDescriptions;

  const userPrompt = `Compare these two artifacts and surface the key tradeoffs:

Artifact A — label: "${labelA}"
Description: ${descA.trim() || '(no description)'}

Artifact B — label: "${labelB}"
Description: ${descB.trim() || '(no description)'}

Return JSON only. Use exactly one of the two labels above for each tradeoff's artifactLabel.`;

  const client = new Anthropic({ apiKey });

  let msg: Awaited<ReturnType<Anthropic['messages']['create']>>;
  try {
    msg = await client.messages.create({
      model: MODEL,
      max_tokens: 768,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    });
  } catch (error) {
    console.error('[AI Tradeoffs] Error:', error);
    const message = error instanceof Error ? error.message : 'Request failed.';
    return { ok: false, error: message };
  }

  const block = msg.content.find((b) => b.type === 'text');
  const raw = block?.type === 'text' ? block.text : '';

  const tradeoffs = parseTradeoffs(raw, input.artifactLabels);

  if (tradeoffs.length === 0) {
    return { ok: false, error: 'Empty or malformed response from AI.' };
  }

  return { ok: true, tradeoffs };
}
