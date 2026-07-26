import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type LlmJsonResult<T> = {
  data: T;
  usedLlm: boolean;
  tokensIn?: number;
  tokensOut?: number;
};

export type LlmTextResult = {
  text: string;
  usedLlm: boolean;
  tokensIn?: number;
  tokensOut?: number;
};

/**
 * Single Anthropic wrapper for analytics Q&A, event extraction, and draft polish.
 * Kill switch: LLM_ENABLED=false (default) → callers must use heuristics.
 *
 * Ethics: only process public text, DB facts, or paste the agent lawfully possesses.
 */
@Injectable()
export class LlmService {
  private readonly logger = new Logger(LlmService.name);

  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<boolean>('llmEnabled') === true;
  }

  get status(): { enabled: boolean; hasKey: boolean; model: string } {
    return {
      enabled: this.enabled,
      hasKey: Boolean((this.config.get<string>('anthropicApiKey') ?? '').trim()),
      model: this.config.get<string>('llmModel') ?? 'claude-sonnet-4-20250514',
    };
  }

  async completeJson<T>(options: {
    system: string;
    user: string;
    schemaHint: string;
    maxTokens?: number;
  }): Promise<LlmJsonResult<T>> {
    const text = await this.completeText({
      system: `${options.system}\n\nReturn ONLY valid JSON matching: ${options.schemaHint}`,
      user: options.user,
      maxTokens: options.maxTokens ?? 4096,
    });
    const data = JSON.parse(extractJson(text.text)) as T;
    return {
      data,
      usedLlm: true,
      tokensIn: text.tokensIn,
      tokensOut: text.tokensOut,
    };
  }

  async completeText(options: {
    system: string;
    user: string;
    maxTokens?: number;
  }): Promise<LlmTextResult> {
    if (!this.enabled) {
      throw new Error('LLM_ENABLED is false — set LLM_ENABLED=true and ANTHROPIC_API_KEY on Railway');
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
            max_tokens: options.maxTokens ?? 2048,
            system: options.system,
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
        this.logger.log(
          `LLM ok model=${model} in=${body.usage?.input_tokens ?? '?'} out=${body.usage?.output_tokens ?? '?'}`,
        );
        return {
          text: text.trim(),
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
