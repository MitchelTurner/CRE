import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const ALLOWED_STATUSES = new Set(['new', 'sent', 'contacted', 'dead', 'deal']);
const ALLOWED_RATINGS = new Set(['up', 'down']);
const ALLOWED_OUTCOMES = new Set([
  'connected',
  'voicemail',
  'wrong_number',
  'not_seller',
  'callback',
]);
const ALLOWED_FEEDBACK_REASONS = new Set([
  'wrong_asset',
  'wrong_owner',
  'bad_timing',
  'other',
]);

const OUTCOME_STATUS: Record<string, string> = {
  connected: 'contacted',
  voicemail: 'contacted',
  wrong_number: 'dead',
  not_seller: 'dead',
  callback: 'contacted',
};

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(status?: string, includeSnoozed = false) {
    if (status && !ALLOWED_STATUSES.has(status)) {
      throw new BadRequestException(
        `Invalid status. Allowed: ${[...ALLOWED_STATUSES].join(', ')}`,
      );
    }

    const now = new Date();
    const items = await this.prisma.lead.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(includeSnoozed
          ? {}
          : { OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: now } }] }),
      },
      orderBy: { updatedAt: 'desc' },
      take: 200,
      include: {
        parcel: {
          include: {
            owner: {
              select: {
                nameRaw: true,
                isAbsentee: true,
                mailingState: true,
                contacts: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  select: { phone: true, email: true, name: true },
                },
              },
            },
            scores: {
              orderBy: { scoredAt: 'desc' },
              take: 1,
              select: { total: true, components: true },
            },
            signals: {
              where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
              select: { type: true },
              take: 8,
            },
          },
        },
        feedback: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { rating: true, reason: true, note: true, createdAt: true },
        },
      },
    });

    return {
      items: items.map((l) => ({
        ...l,
        signalTypes: [...new Set(l.parcel.signals.map((s) => s.type))],
      })),
    };
  }

  async create(parcelId: string, whyNow?: string) {
    const parcel = await this.prisma.parcel.findUnique({
      where: { id: parcelId },
      include: {
        scores: { orderBy: { scoredAt: 'desc' }, take: 1 },
        owner: true,
      },
    });
    if (!parcel) throw new NotFoundException(`Parcel ${parcelId} not found`);

    const existing = await this.prisma.lead.findFirst({
      where: { parcelId, status: { notIn: ['dead'] }, leadType: 'seller' },
      orderBy: { createdAt: 'desc' },
    });
    if (existing) return this.getById(existing.id);

    const created = await this.prisma.lead.create({
      data: {
        parcelId,
        status: 'new',
        leadType: 'seller',
        whyNow:
          whyNow?.trim() ||
          `Manual pipeline add — score ${parcel.scores[0]?.total ?? 'n/a'}, owner ${parcel.owner?.nameRaw ?? 'unknown'}.`,
      },
    });
    return this.getById(created.id);
  }

  async updateStatus(id: string, status: string) {
    if (!ALLOWED_STATUSES.has(status)) {
      throw new BadRequestException(
        `Invalid status. Allowed: ${[...ALLOWED_STATUSES].join(', ')}`,
      );
    }

    try {
      await this.prisma.lead.update({
        where: { id },
        data: { status },
      });
      return this.getById(id);
    } catch {
      throw new NotFoundException(`Lead ${id} not found`);
    }
  }

  async logOutcome(id: string, outcome: string) {
    if (!ALLOWED_OUTCOMES.has(outcome)) {
      throw new BadRequestException(
        `Invalid outcome. Allowed: ${[...ALLOWED_OUTCOMES].join(', ')}`,
      );
    }
    const status = OUTCOME_STATUS[outcome] ?? 'contacted';
    try {
      await this.prisma.lead.update({
        where: { id },
        data: { lastOutcome: outcome, status },
      });
      return this.getById(id);
    } catch {
      throw new NotFoundException(`Lead ${id} not found`);
    }
  }

  async snooze(id: string, days: number) {
    const n = Number(days);
    if (![30, 90].includes(n)) {
      throw new BadRequestException('snooze days must be 30 or 90');
    }
    const until = new Date(Date.now() + n * 24 * 60 * 60 * 1000);
    try {
      await this.prisma.lead.update({
        where: { id },
        data: { snoozedUntil: until },
      });
      return this.getById(id);
    } catch {
      throw new NotFoundException(`Lead ${id} not found`);
    }
  }

  async addFeedback(id: string, rating: string, note?: string, reason?: string) {
    if (!ALLOWED_RATINGS.has(rating)) {
      throw new BadRequestException(`Invalid rating. Allowed: up, down`);
    }
    if (reason && !ALLOWED_FEEDBACK_REASONS.has(reason)) {
      throw new BadRequestException(
        `Invalid reason. Allowed: ${[...ALLOWED_FEEDBACK_REASONS].join(', ')}`,
      );
    }

    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);

    await this.prisma.leadFeedback.create({
      data: {
        leadId: id,
        rating,
        reason: reason?.trim() || null,
        note: note?.trim() || null,
      },
    });

    return this.getById(id);
  }

  /** Adjacent lead pins for keyboard next/prev navigation. */
  async neighbors(id: string) {
    const now = new Date();
    const leads = await this.prisma.lead.findMany({
      where: {
        status: { in: ['new', 'sent', 'contacted'] },
        OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: now } }],
      },
      orderBy: { updatedAt: 'desc' },
      take: 100,
      select: { id: true, parcel: { select: { pin: true } } },
    });
    const idx = leads.findIndex((l) => l.id === id);
    if (idx < 0) return { prevPin: null, nextPin: null, index: -1, total: leads.length };
    return {
      prevPin: idx > 0 ? leads[idx - 1]!.parcel.pin : null,
      nextPin: idx < leads.length - 1 ? leads[idx + 1]!.parcel.pin : null,
      index: idx,
      total: leads.length,
    };
  }

  private async getById(id: string) {
    const now = new Date();
    const lead = await this.prisma.lead.findUnique({
      where: { id },
      include: {
        parcel: {
          include: {
            owner: {
              select: {
                nameRaw: true,
                isAbsentee: true,
                mailingState: true,
                contacts: {
                  orderBy: { createdAt: 'desc' },
                  take: 1,
                  select: { phone: true, email: true, name: true },
                },
              },
            },
            scores: {
              orderBy: { scoredAt: 'desc' },
              take: 1,
              select: { total: true, components: true },
            },
            signals: {
              where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
              select: { type: true },
              take: 8,
            },
          },
        },
        feedback: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { rating: true, reason: true, note: true, createdAt: true },
        },
      },
    });
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);
    return {
      ...lead,
      signalTypes: [...new Set(lead.parcel.signals.map((s) => s.type))],
    };
  }
}
