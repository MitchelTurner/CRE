import { Logger } from '@nestjs/common';
import type { LlmService } from '../../llm/llm.service';
import type { EventSourceClient, RawEventDraft } from './event-source.types';
import { classifyEventHeuristic } from './classify-event';

type HtmlSource = {
  sourceId: string;
  url: string;
  cityHint: string;
};

/**
 * Best-effort HTML scrape for Post & Courier / Bisnow style pages.
 * When LLM_ENABLED, extract structured events; otherwise return empty (avoid garbage).
 * Prefer ICS feeds when available.
 */
export class HtmlEventClient implements EventSourceClient {
  private readonly logger = new Logger(HtmlEventClient.name);

  constructor(
    private readonly source: HtmlSource,
    private readonly llm: LlmService,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  get sourceId(): string {
    return this.source.sourceId;
  }

  async fetchUpcoming(from: Date, to: Date): Promise<RawEventDraft[]> {
    if (!this.source.url) return [];
    try {
      const res = await this.fetchImpl(this.source.url, {
        headers: {
          Accept: 'text/html',
          'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+contact@example.com)',
        },
      });
      if (!res.ok) {
        this.logger.warn(`${this.sourceId} HTTP ${res.status}`);
        return [];
      }
      const html = (await res.text()).slice(0, 120_000);
      if (!this.llm.enabled) {
        this.logger.debug(`${this.sourceId}: LLM disabled — skip HTML extraction`);
        return [];
      }
      const result = await this.llm.completeJson<{
        events: Array<{
          name: string;
          startsAt: string;
          endsAt?: string;
          venue?: string;
          hostOrg?: string;
          url?: string;
          category?: string;
          ownerDensity?: 'high' | 'medium' | 'low';
          audience?: string;
        }>;
      }>({
        system:
          'Extract upcoming real estate events in Upstate SC / Greenville from the article HTML. Ignore homebuyer seminars.',
        user: `Window: ${from.toISOString()} to ${to.toISOString()}\n\nHTML:\n${html}`,
        schemaHint:
          '{ "events": [{ "name", "startsAt" ISO, "endsAt"?, "venue"?, "hostOrg"?, "url"?, "category"?, "ownerDensity"?, "audience"? }] }',
      });
      const out: RawEventDraft[] = [];
      for (const e of result.data.events ?? []) {
        const startsAt = new Date(e.startsAt);
        if (Number.isNaN(startsAt.getTime()) || startsAt < from || startsAt > to) continue;
        const draft: RawEventDraft = {
          name: e.name,
          startsAt,
          endsAt: e.endsAt ? new Date(e.endsAt) : null,
          venue: e.venue ?? null,
          city: this.source.cityHint,
          hostOrg: e.hostOrg ?? null,
          url: e.url ?? this.source.url,
          category: e.category,
          ownerDensity: e.ownerDensity,
          audience: e.audience,
          rawPayload: { ...e, sourceId: this.sourceId },
        };
        const classified = classifyEventHeuristic(draft);
        out.push({
          ...draft,
          category: draft.category ?? classified.category,
          ownerDensity: draft.ownerDensity ?? classified.ownerDensity,
          audience: draft.audience ?? classified.audience,
        });
      }
      return out;
    } catch (err) {
      this.logger.warn(
        `${this.sourceId} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }
}
