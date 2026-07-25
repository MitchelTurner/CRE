import { Logger } from '@nestjs/common';
import type { EventSourceClient, RawEventDraft } from './event-source.types';
import { classifyEventHeuristic } from './classify-event';

/**
 * Prefer ICS/iCal feeds from association calendars over HTML scrapers.
 * Configure EVENT_ICS_FEEDS as comma-separated "sourceId|url" pairs.
 */
export class IcsFeedClient implements EventSourceClient {
  private readonly logger = new Logger(IcsFeedClient.name);

  constructor(
    readonly sourceId: string,
    private readonly feedUrl: string,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async fetchUpcoming(from: Date, to: Date): Promise<RawEventDraft[]> {
    if (!this.feedUrl) return [];
    try {
      const res = await this.fetchImpl(this.feedUrl, {
        headers: {
          Accept: 'text/calendar, text/plain, */*',
          'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+contact@example.com)',
        },
      });
      if (!res.ok) {
        this.logger.warn(`ICS ${this.sourceId} HTTP ${res.status}`);
        return [];
      }
      const text = await res.text();
      return parseIcs(text, this.sourceId, from, to);
    } catch (err) {
      this.logger.warn(
        `ICS ${this.sourceId} failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return [];
    }
  }
}

export function parseIcs(
  text: string,
  sourceId: string,
  from: Date,
  to: Date,
): RawEventDraft[] {
  const blocks = text.split(/BEGIN:VEVENT/i).slice(1);
  const out: RawEventDraft[] = [];
  for (const block of blocks) {
    const body = block.split(/END:VEVENT/i)[0] ?? '';
    const summary = icsField(body, 'SUMMARY');
    const dtstart = icsField(body, 'DTSTART');
    if (!summary || !dtstart) continue;
    const startsAt = parseIcsDate(dtstart);
    if (!startsAt || startsAt < from || startsAt > to) continue;
    const location = icsField(body, 'LOCATION');
    const url = icsField(body, 'URL');
    const draft: RawEventDraft = {
      name: summary,
      startsAt,
      endsAt: parseIcsDate(icsField(body, 'DTEND') ?? '') ?? null,
      venue: location,
      city: /greenville/i.test(location ?? '') ? 'Greenville' : null,
      hostOrg: sourceId,
      url,
      rawPayload: { sourceId, summary, dtstart, location },
    };
    out.push({ ...draft, ...classifyEventHeuristic(draft) });
  }
  return out;
}

function icsField(block: string, name: string): string | null {
  const re = new RegExp(`^${name}(?:;[^:]*)?:(.*)$`, 'im');
  const m = block.match(re);
  if (!m?.[1]) return null;
  return m[1].replace(/\\n/g, ' ').replace(/\\,/g, ',').trim();
}

function parseIcsDate(value: string): Date | null {
  if (!value) return null;
  // 20260725T180000Z or 20260725
  const m = value.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})Z?)?/);
  if (!m) {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const iso = `${m[1]}-${m[2]}-${m[3]}T${m[4] ?? '12'}:${m[5] ?? '00'}:${m[6] ?? '00'}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}
