import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HitlService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Queue top scored parcels that are missing SoS/ROD/skip-trace contacts
   * for human review before digest.
   */
  async refreshQueue(limit = 25): Promise<number> {
    const parcels = await this.prisma.parcel.findMany({
      where: { isActive: true, isCommercial: true },
      include: {
        owner: { include: { contacts: true } },
        scores: { orderBy: { scoredAt: 'desc' }, take: 1 },
        signals: { select: { type: true } },
        enrichmentReviews: {
          where: { status: 'pending' },
          take: 1,
        },
      },
    });

    parcels.sort((a, b) => (b.scores[0]?.total ?? 0) - (a.scores[0]?.total ?? 0));
    let created = 0;

    for (const parcel of parcels.slice(0, limit)) {
      if (parcel.enrichmentReviews.length) continue;
      const reasons: string[] = [];
      const owner = parcel.owner;
      if (owner?.isEntity && !owner.sosFetchedAt) reasons.push('missing_sos');
      if (!parcel.signals.some((s) => s.type === 'mortgage_maturity')) {
        reasons.push('missing_rod_mortgage');
      }
      const hasPhone = owner?.contacts.some((c) => c.phone);
      if (!hasPhone && owner?.isAbsentee) reasons.push('missing_skiptrace_phone');
      if (!parcel.latitude || !parcel.longitude) reasons.push('missing_coordinates');

      if (!reasons.length) continue;

      await this.prisma.enrichmentReview.create({
        data: {
          parcelId: parcel.id,
          status: 'pending',
          reasons: reasons as unknown as Prisma.InputJsonValue,
        },
      });
      created += 1;
    }

    return created;
  }

  list(status = 'pending') {
    return this.prisma.enrichmentReview.findMany({
      where: { status },
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        parcel: {
          include: {
            owner: { select: { nameRaw: true, isEntity: true, sosStatus: true } },
            scores: { orderBy: { scoredAt: 'desc' }, take: 1, select: { total: true } },
          },
        },
      },
    });
  }

  async update(id: string, status: string, note?: string) {
    if (!['pending', 'done', 'skipped'].includes(status)) {
      throw new BadRequestException(`Invalid status ${status}`);
    }
    try {
      return await this.prisma.enrichmentReview.update({
        where: { id },
        data: { status, note: note?.trim() || null },
        include: { parcel: { select: { pin: true, situsAddress: true } } },
      });
    } catch {
      throw new NotFoundException(`Review ${id} not found`);
    }
  }
}
