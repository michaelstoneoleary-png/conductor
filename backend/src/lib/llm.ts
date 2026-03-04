import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export interface LLMResponse {
  content: string;
  tokenIn: number;
  tokenOut: number;
}

export function getProvider(model: string): 'anthropic' | 'openai' {
  if (model.startsWith('claude')) return 'anthropic';
  return 'openai';
}

/**
 * Call an LLM with a system + user prompt, expecting a JSON response.
 * Wraps both Anthropic and OpenAI APIs with a consistent interface.
 */
export async function callLLM(
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxTokens = 4096
): Promise<LLMResponse> {
  const provider = getProvider(model);

  if (provider === 'anthropic') {
    const response = await anthropic.messages.create({
      model,
      max_tokens: maxTokens,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
    });

    const content = response.content
      .filter((b) => b.type === 'text')
      .map((b) => (b as { type: 'text'; text: string }).text)
      .join('');

    return {
      content,
      tokenIn: response.usage.input_tokens,
      tokenOut: response.usage.output_tokens,
    };
  } else {
    const response = await openai.chat.completions.create({
      model,
      max_tokens: maxTokens,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content ?? '{}';
    return {
      content,
      tokenIn: response.usage?.prompt_tokens ?? 0,
      tokenOut: response.usage?.completion_tokens ?? 0,
    };
  }
}

/**
 * Parse JSON from an LLM response, stripping markdown code fences if present.
 */
export function parseJSON<T>(raw: string): T {
  const stripped = raw
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/, '')
    .trim();
  return JSON.parse(stripped) as T;
}

/**
 * Round-trip an object through JSON serialization so it satisfies Prisma's
 * InputJsonValue constraint. The double cast via `unknown` is required because
 * Prisma's InputJsonValue uses an opaque branded type that doesn't structurally
 * match `Record<string, unknown>` even though the runtime values are identical.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function toJson(obj: unknown): any {
  return JSON.parse(JSON.stringify(obj));
}
