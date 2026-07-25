import { Logger } from '@nestjs/common';
import type { EventSourceClient, RawEventDraft } from './event-source.types';
import { classifyEventHeuristic } from './classify-event';

/**
 * Eventbrite public search within Greenville SC radius.
 * High noise — always classify; stub when EVENTBRITE_TOKEN unset.
 */
export class EventbriteClient implements EventSourceClient {
  readonly sourceId = 'eventbrite';
  private readonly logger = new Logger(EventbriteClient.name);

  constructor(
    private readonly token: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchUpcoming(from: Date, to: Date): Promise<RawEventDraft[]> {
    if (!this.token) {
      this.logger.debug('EVENTBRITE_TOKEN unset — stub');
      return [];
    }
    const qs = new URLSearchParams({
      q: 'real estate',
      'location.address': 'Greenville, SC',
      'location.within': '40mi',
      'start_date.range_start': from.toISOString(),
      'start_date.range_end': to.toISOString(),
      expand: 'venue',
    });
    const res = await this.fetchImpl(
      `https://www.eventbriteapi.com/v3/events/search/?${qs}`,
      {
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: 'application/json',
          'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+contact@example.com)',
        },
      },
    );
    if (!res.ok) {
      this.logger.warn(`Eventbrite HTTP ${res.status}`);
      return [];
    }
    const data = (await res.json()) as {
      events?: Array<Record<string, unknown>>;
    };
    const out: RawEventDraft[] = [];
    for (const e of data.events ?? []) {
      const name = String(
        (e.name as { text?: string } | undefined)?.text ?? e.name ?? '',
      ).trim();
      const start = String(
        (e.start as { utc?: string } | undefined)?.utc ?? '',
      );
      if (!name || !start) continue;
      const venue = e.venue as { name?: string; address?: { city?: string } } | undefined;
      const draft: RawEventDraft = {
        name,
        startsAt: new Date(start),
        endsAt: (e.end as { utc?: string } | undefined)?.utc
          ? new Date(String((e.end as { utc?: string }).utc))
          : null,
        venue: venue?.name ?? null,
        city: venue?.address?.city ?? 'Greenville',
        hostOrg: null,
        url: typeof e.url === 'string' ? e.url : null,
        rawPayload: e,
      };
      const classified = classifyEventHeuristic(draft);
      if (classified.ownerDensity === 'low') continue;
      out.push({ ...draft, ...classified });
    }
    return out;
  }
}
