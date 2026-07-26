import type { EventSourceClient, RawEventDraft } from './event-source.types';
import { classifyEventHeuristic } from './classify-event';

type SeedTemplate = {
  name: string;
  hostOrg: string;
  venue: string;
  city?: string;
  url?: string;
  /** Days from "now" for the next occurrence (rolling so the feed stays populated). */
  daysFromNow: number;
  hourLocal?: number;
  category?: string;
  ownerDensity?: 'high' | 'medium' | 'low';
};

/**
 * Curated Greenville / Upstate CRE calendar stubs.
 * These are relationship-planning placeholders — verify dates/venues before attending.
 * Ethics: public association calendars only; not scraped from LinkedIn.
 */
const SEED_TEMPLATES: SeedTemplate[] = [
  {
    name: 'Upstate CRE Owners Roundtable',
    hostOrg: 'Greenville CRE network',
    venue: 'Downtown Greenville',
    daysFromNow: 10,
    hourLocal: 8,
    category: 'networking',
    ownerDensity: 'high',
    url: 'https://www.greenvillechamber.com/',
  },
  {
    name: 'NAIOP Upstate Lunch & Learn',
    hostOrg: 'NAIOP Upstate',
    venue: 'Greenville, SC',
    daysFromNow: 18,
    hourLocal: 11,
    category: 'education',
    ownerDensity: 'high',
    url: 'https://www.naiop.org/',
  },
  {
    name: 'CCIM South Carolina Chapter Meeting',
    hostOrg: 'CCIM South Carolina',
    venue: 'Greenville / Columbia rotating',
    daysFromNow: 27,
    hourLocal: 11,
    category: 'education',
    ownerDensity: 'high',
    url: 'https://www.ccim.com/',
  },
  {
    name: 'UCREIA Investor Meetup — Greenville',
    hostOrg: 'UCREIA',
    venue: 'Greenville, SC',
    daysFromNow: 35,
    hourLocal: 18,
    category: 'networking',
    ownerDensity: 'high',
    url: 'https://ucreia.com/',
  },
  {
    name: 'CREW Greenville Networking Mixer',
    hostOrg: 'CREW Greenville',
    venue: 'Greenville, SC',
    daysFromNow: 42,
    hourLocal: 17,
    category: 'networking',
    ownerDensity: 'medium',
    url: 'https://crewnetwork.org/',
  },
  {
    name: 'Greenville Chamber Commercial Real Estate Forum',
    hostOrg: 'Greenville Chamber',
    venue: 'Greenville Chamber',
    daysFromNow: 55,
    hourLocal: 8,
    category: 'conference',
    ownerDensity: 'high',
    url: 'https://www.greenvillechamber.com/',
  },
  {
    name: '1031 Exchange & Capital Markets Breakfast',
    hostOrg: 'Upstate Investment Sales',
    venue: 'Eastside Greenville',
    daysFromNow: 68,
    hourLocal: 8,
    category: 'seminar',
    ownerDensity: 'high',
  },
];

function atLocalDaysFromNow(days: number, hour: number, asOf: Date): Date {
  const d = new Date(asOf);
  d.setDate(d.getDate() + days);
  d.setHours(hour, 0, 0, 0);
  return d;
}

export class SeedEventClient implements EventSourceClient {
  readonly sourceId = 'seed';

  async fetchUpcoming(from: Date, to: Date): Promise<RawEventDraft[]> {
    const out: RawEventDraft[] = [];
    for (const t of SEED_TEMPLATES) {
      const startsAt = atLocalDaysFromNow(t.daysFromNow, t.hourLocal ?? 9, from);
      if (startsAt < from || startsAt > to) continue;
      const draft: RawEventDraft = {
        name: t.name,
        startsAt,
        endsAt: null,
        venue: t.venue,
        city: t.city ?? 'Greenville',
        hostOrg: t.hostOrg,
        url: t.url ?? null,
        category: t.category,
        ownerDensity: t.ownerDensity,
        rawPayload: { seed: true, placeholder: true },
      };
      const classified = classifyEventHeuristic(draft);
      out.push({
        ...draft,
        ...classified,
        ownerDensity: draft.ownerDensity ?? classified.ownerDensity,
      });
    }
    return out;
  }
}
