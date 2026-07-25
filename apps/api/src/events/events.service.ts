import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { eventDedupeKey } from './event-dedupe';
import { classifyEventHeuristic } from './clients/classify-event';
import type { RawEventDraft } from './clients/event-source.types';
import { MatchingService } from './matching.service';

const STATUSES = new Set(['new', 'approved', 'hidden', 'attended']);
const DENSITIES = new Set(['high', 'medium', 'low']);

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
  ) {}

  async list(query: { from?: string; density?: string; status?: string }) {
    const from = query.from ? new Date(query.from) : new Date();
    if (Number.isNaN(from.getTime())) throw new BadRequestException('Invalid from');
    if (query.density && !DENSITIES.has(query.density)) {
      throw new BadRequestException('Invalid density');
    }
    if (query.status && !STATUSES.has(query.status)) {
      throw new BadRequestException('Invalid status');
    }

    const items = await this.prisma.event.findMany({
      where: {
        startsAt: { gte: from },
        ...(query.density ? { ownerDensity: query.density } : {}),
        ...(query.status ? { status: query.status } : { status: { not: 'hidden' } }),
      },
      orderBy: [{ ownerDensity: 'asc' }, { startsAt: 'asc' }],
      take: 200,
      include: {
        _count: { select: { attendees: true, briefs: true } },
      },
    });

    // high first (manual sort — prisma can't easily order high>medium>low)
    const rank = (d: string | null) => (d === 'high' ? 0 : d === 'medium' ? 1 : 2);
    items.sort((a, b) => rank(a.ownerDensity) - rank(b.ownerDensity) || a.startsAt.getTime() - b.startsAt.getTime());
    return { items };
  }

  async upcomingForDigest(withinDays = 14) {
    const from = new Date();
    const to = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
    const items = await this.prisma.event.findMany({
      where: {
        startsAt: { gte: from, lte: to },
        status: { in: ['new', 'approved'] },
        ownerDensity: { in: ['high', 'medium'] },
      },
      orderBy: { startsAt: 'asc' },
      take: 12,
    });
    const rank = (d: string | null) => (d === 'high' ? 0 : 1);
    items.sort((a, b) => rank(a.ownerDensity) - rank(b.ownerDensity) || a.startsAt.getTime() - b.startsAt.getTime());
    return items;
  }

  async updateStatus(id: string, status: string) {
    if (!STATUSES.has(status)) {
      throw new BadRequestException(`Invalid status. Allowed: ${[...STATUSES].join(', ')}`);
    }
    try {
      return await this.prisma.event.update({ where: { id }, data: { status } });
    } catch {
      throw new NotFoundException(`Event ${id} not found`);
    }
  }

  async createManual(input: {
    name: string;
    startsAt: string;
    endsAt?: string;
    venue?: string;
    city?: string;
    hostOrg?: string;
    url?: string;
    category?: string;
    ownerDensity?: string;
    audience?: string;
    status?: string;
  }) {
    if (!input.name?.trim()) throw new BadRequestException('name required');
    const startsAt = new Date(input.startsAt);
    if (Number.isNaN(startsAt.getTime())) throw new BadRequestException('startsAt invalid');
    const draft: RawEventDraft = {
      name: input.name.trim(),
      startsAt,
      endsAt: input.endsAt ? new Date(input.endsAt) : null,
      venue: input.venue ?? null,
      city: input.city ?? 'Greenville',
      hostOrg: input.hostOrg ?? 'manual',
      url: input.url ?? null,
      category: input.category,
      ownerDensity: (input.ownerDensity as 'high' | 'medium' | 'low') ?? null,
      audience: input.audience,
      rawPayload: { manual: true },
    };
    const classified = classifyEventHeuristic(draft);
    return this.upsertDraft({
      ...draft,
      ...classified,
      ownerDensity: draft.ownerDensity ?? classified.ownerDensity,
    }, 'manual');
  }

  async upsertDraft(draft: RawEventDraft, sourceId: string) {
    const dedupeKey = eventDedupeKey(draft.name, draft.startsAt, draft.venue);
    const data: Prisma.EventCreateInput = {
      name: draft.name,
      startsAt: draft.startsAt,
      endsAt: draft.endsAt ?? null,
      venue: draft.venue ?? null,
      city: draft.city ?? null,
      hostOrg: draft.hostOrg ?? null,
      url: draft.url ?? null,
      sourceId,
      category: draft.category ?? null,
      ownerDensity: draft.ownerDensity ?? null,
      audience: draft.audience ?? null,
      rawPayload: draft.rawPayload as Prisma.InputJsonValue,
      dedupeKey,
      status: 'new',
    };
    const event = await this.prisma.event.upsert({
      where: { dedupeKey },
      create: data,
      update: {
        name: data.name,
        startsAt: data.startsAt,
        endsAt: data.endsAt,
        venue: data.venue,
        city: data.city,
        hostOrg: data.hostOrg,
        url: data.url,
        category: data.category,
        ownerDensity: data.ownerDensity,
        audience: data.audience,
        rawPayload: data.rawPayload,
        sourceId,
      },
    });

    for (const p of draft.people ?? []) {
      const person = await this.matching.upsertPerson({
        nameRaw: p.name,
        company: p.company,
        title: p.title,
        source: `event:${sourceId}`,
      });
      await this.prisma.eventAttendee.upsert({
        where: { eventId_personId: { eventId: event.id, personId: person.id } },
        create: {
          eventId: event.id,
          personId: person.id,
          role: p.role ?? 'attendee',
        },
        update: { role: p.role ?? 'attendee' },
      });
      await this.matching.matchPerson(person.id);
    }

    return event;
  }

  async getById(id: string) {
    const event = await this.prisma.event.findUnique({
      where: { id },
      include: {
        attendees: {
          include: {
            person: {
              include: {
                ownerMatches: {
                  where: { confirmed: { not: false } },
                  include: {
                    owner: {
                      include: {
                        parcels: {
                          where: { isActive: true, isCommercial: true },
                          include: {
                            scores: { orderBy: { scoredAt: 'desc' }, take: 1 },
                          },
                          take: 5,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
        briefs: { orderBy: { createdAt: 'desc' }, take: 3 },
      },
    });
    if (!event) throw new NotFoundException(`Event ${id} not found`);
    return event;
  }

  async pasteAttendees(eventId: string, text: string, role = 'attendee') {
    const event = await this.prisma.event.findUnique({ where: { id: eventId } });
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);
    const rows = this.matching.parsePasteLines(text);
    let linked = 0;
    for (const row of rows) {
      const person = await this.matching.upsertPerson({
        nameRaw: row.nameRaw,
        company: row.company,
        title: row.title,
        source: 'paste',
      });
      await this.prisma.eventAttendee.upsert({
        where: { eventId_personId: { eventId, personId: person.id } },
        create: { eventId, personId: person.id, role },
        update: { role },
      });
      await this.matching.matchPerson(person.id);
      linked += 1;
    }
    return { linked };
  }
}
