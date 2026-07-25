import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type LlmJsonResult<T> = {
  data: T;
  usedLlm: boolean;
  tokensIn?: number;
  tokensOut?: number;
};

/**
 * Single Anthropic wrapper for event extraction/classification and paste parsing.
 * Kill switch: LLM_ENABLED=false (default) → callers must use heuristics.
 *
 * Ethics: only process public text or paste the agent lawfully possesses.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<boolean>('llmEnabled') === true;
  }

  async completeJson<T>(options: {
    system: string;
    user: string;
    schemaHint: string;
  }): Promise<LlmJsonResult<T>> {
    if (!this.enabled) {
      throw new Error('LLM_ENABLED is false');
    }
    const apiKey = this.config.get<string>('anthropicApiKey') ?? '';
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set');
    }

    const model = this.config.get<string>('llmModel') ?? 'claude-sonnet-4-20250514';
    let lastErr: Error | null = null;

    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model,
            max_tokens: 4096,
            system: `${options.system}\n\nReturn ONLY valid JSON matching: ${options.schemaHint}`,
            messages: [{ role: 'user', content: options.user }],
          }),
        });
        if (!res.ok) {
          throw new Error(`Anthropic HTTP ${res.status}: ${await res.text()}`);
        }
        const body = (await res.json()) as {
          content?: Array<{ type: string; text?: string }>;
          usage?: { input_tokens?: number; output_tokens?: number };
        };
        const text = body.content?.find((c) => c.type === 'text')?.text ?? '';
        const jsonText = extractJson(text);
        const data = JSON.parse(jsonText) as T;
        this.logger.log(
          `LLM ok model=${model} in=${body.usage?.input_tokens ?? '?'} out=${body.usage?.output_tokens ?? '?'}`,
        );
        return {
          data,
          usedLlm: true,
          tokensIn: body.usage?.input_tokens,
          tokensOut: body.usage?.output_tokens,
        };
      } catch (err) {
        lastErr = err instanceof Error ? err : new Error(String(err));
        this.logger.warn(`LLM attempt ${attempt + 1} failed: ${lastErr.message}`);
      }
    }
    throw lastErr ?? new Error('LLM failed');
  }
}

function extractJson(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) return trimmed;
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence?.[1]) return fence[1].trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start >= 0 && end > start) return trimmed.slice(start, end + 1);
  throw new Error('No JSON object in LLM response');
}
