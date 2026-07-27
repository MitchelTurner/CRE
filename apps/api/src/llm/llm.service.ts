import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { cleanEnvSecret, resolveLlmEnabled } from '../config/env-flags';

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
  private loggedBoot = false;

  constructor(private readonly config: ConfigService) {
    // Log once after first status/enabled check so Railway logs show AI wiring.
    queueMicrotask(() => this.logBootStatus());
  }

  private logBootStatus() {
    if (this.loggedBoot) return;
    this.loggedBoot = true;
    const s = this.status;
    this.logger.log(
      `LLM status: enabled=${s.enabled} hasKey=${s.hasKey} model=${s.model} reason=${s.reason}`,
    );
  }

  get enabled(): boolean {
    // Prefer live process.env so Railway var changes after rebuild are respected.
    return resolveLlmEnabled(process.env).enabled;
  }

  get status(): {
    enabled: boolean;
    hasKey: boolean;
    model: string;
    reason: string;
    keyPrefix: string | null;
  } {
    const resolved = resolveLlmEnabled(process.env);
    const key = cleanEnvSecret(
      this.config.get<string>('anthropicApiKey') || process.env.ANTHROPIC_API_KEY,
    );
    return {
      enabled: resolved.enabled,
      hasKey: resolved.keyPresent,
      model: this.config.get<string>('llmModel') ?? 'claude-sonnet-4-6',
      reason: resolved.reason,
      keyPrefix: key.length > 8 ? `${key.slice(0, 7)}…` : null,
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
      throw new Error(
        this.status.reason ||
          'LLM off — set LLM_ENABLED=true and ANTHROPIC_API_KEY on the Railway API service, then redeploy',
      );
    }
    const apiKey = cleanEnvSecret(
      this.config.get<string>('anthropicApiKey') || process.env.ANTHROPIC_API_KEY,
    );
    if (!apiKey) {
      throw new Error('ANTHROPIC_API_KEY is not set on the Railway API service');
    }

    const model = this.config.get<string>('llmModel') ?? 'claude-sonnet-4-6';
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

  /**
   * Vision OCR / extraction. imageBase64 without data: prefix.
   * Ethics: only images the agent lawfully possesses (event roster photos, etc.).
   */
  async completeVisionText(options: {
    system: string;
    user: string;
    imageBase64: string;
    mediaType: 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';
    maxTokens?: number;
  }): Promise<LlmTextResult> {
    if (!this.enabled) {
      throw new Error(
        this.status.reason ||
          'LLM off — set LLM_ENABLED=true and ANTHROPIC_API_KEY for roster OCR',
      );
    }
    const apiKey = cleanEnvSecret(
      this.config.get<string>('anthropicApiKey') || process.env.ANTHROPIC_API_KEY,
    );
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');

    const model = this.config.get<string>('llmModel') ?? 'claude-sonnet-4-6';
    const raw = options.imageBase64.replace(/^data:[^;]+;base64,/, '').trim();
    if (!raw || raw.length < 80) throw new Error('imageBase64 missing or too small');
    if (raw.length > 1_800_000) throw new Error('image too large — use a smaller photo');

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model,
        max_tokens: options.maxTokens ?? 4096,
        system: options.system,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: options.mediaType,
                  data: raw,
                },
              },
              { type: 'text', text: options.user },
            ],
          },
        ],
      }),
    });
    if (!res.ok) {
      throw new Error(`Anthropic vision HTTP ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as {
      content?: Array<{ type: string; text?: string }>;
      usage?: { input_tokens?: number; output_tokens?: number };
    };
    const text = body.content?.find((c) => c.type === 'text')?.text ?? '';
    return {
      text: text.trim(),
      usedLlm: true,
      tokensIn: body.usage?.input_tokens,
      tokensOut: body.usage?.output_tokens,
    };
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
