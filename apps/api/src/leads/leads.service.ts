import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const ALLOWED_STATUSES = new Set(['new', 'sent', 'contacted', 'dead', 'deal']);
const ALLOWED_RATINGS = new Set(['up', 'down']);

@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(status?: string) {
    if (status && !ALLOWED_STATUSES.has(status)) {
      throw new BadRequestException(
        `Invalid status. Allowed: ${[...ALLOWED_STATUSES].join(', ')}`,
      );
    }

    const items = await this.prisma.lead.findMany({
      where: status ? { status } : undefined,
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
              },
            },
            scores: {
              orderBy: { scoredAt: 'desc' },
              take: 1,
              select: { total: true },
            },
          },
        },
        feedback: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { rating: true, note: true, createdAt: true },
        },
      },
    });

    return { items };
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

  async addFeedback(id: string, rating: string, note?: string) {
    if (!ALLOWED_RATINGS.has(rating)) {
      throw new BadRequestException(`Invalid rating. Allowed: up, down`);
    }

    const lead = await this.prisma.lead.findUnique({ where: { id } });
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);

    await this.prisma.leadFeedback.create({
      data: {
        leadId: id,
        rating,
        note: note?.trim() || null,
      },
    });

    return this.getById(id);
  }

  private async getById(id: string) {
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
              },
            },
            scores: {
              orderBy: { scoredAt: 'desc' },
              take: 1,
              select: { total: true },
            },
          },
        },
        feedback: {
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: { rating: true, note: true, createdAt: true },
        },
      },
    });
    if (!lead) throw new NotFoundException(`Lead ${id} not found`);
    return lead;
  }
}
