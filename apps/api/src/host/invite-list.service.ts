import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/**
 * M9 — Host Mode: CSV invite lists from the scored owner database.
 * For self-hosted owner breakfasts (Event.hostOrg = "self").
 */
@Injectable()
export class InviteListService {
  constructor(private readonly prisma: PrismaService) {}

  async build(filters: {
    minScore?: number;
    landUse?: string;
    ownerType?: 'entity' | 'individual' | 'absentee';
    excludeContactedWithinDays?: number;
    limit?: number;
  }) {
    const minScore = filters.minScore ?? 50;
    const limit = Math.min(filters.limit ?? 200, 1000);
    const excludeDays = filters.excludeContactedWithinDays ?? 90;
    const cutoff = new Date(Date.now() - excludeDays * 24 * 60 * 60 * 1000);

    const parcels = await this.prisma.parcel.findMany({
      where: {
        isActive: true,
        isCommercial: true,
        ...(filters.landUse
          ? {
              OR: [
                { landUseCode: filters.landUse },
                { propType: filters.landUse },
              ],
            }
          : {}),
        owner: {
          ...(filters.ownerType === 'entity' ? { isEntity: true } : {}),
          ...(filters.ownerType === 'individual' ? { isEntity: false } : {}),
          ...(filters.ownerType === 'absentee' ? { isAbsentee: true } : {}),
        },
        leads: {
          none: {
            status: { in: ['invited', 'attended_event', 'contacted', 'deal'] },
            updatedAt: { gte: cutoff },
          },
        },
      },
      include: {
        owner: {
          include: {
            contacts: { orderBy: { createdAt: 'desc' }, take: 1 },
          },
        },
        scores: { orderBy: { scoredAt: 'desc' }, take: 1 },
      },
      take: limit * 3,
    });

    const rows = parcels
      .map((p) => ({
        ownerId: p.ownerId,
        ownerName: p.owner?.nameRaw ?? '',
        mailingAddress: p.owner?.mailingAddress ?? '',
        mailingCity: p.owner?.mailingCity ?? null,
        mailingState: p.owner?.mailingState ?? null,
        mailingZip: p.owner?.mailingZip ?? null,
        isEntity: p.owner?.isEntity ?? false,
        isAbsentee: p.owner?.isAbsentee ?? false,
        pin: p.pin,
        situsAddress: p.situsAddress,
        propType: p.propType,
        score: p.scores[0]?.total ?? null,
        phone: p.owner?.contacts[0]?.phone ?? null,
        email: p.owner?.contacts[0]?.email ?? null,
      }))
      .filter((r) => (r.score ?? 0) >= minScore)
      .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
      .slice(0, limit);

    const header = [
      'ownerName',
      'phone',
      'email',
      'mailingAddress',
      'mailingCity',
      'mailingState',
      'mailingZip',
      'pin',
      'situsAddress',
      'propType',
      'score',
      'isEntity',
      'isAbsentee',
    ];
    const lines = [header.join(',')];
    for (const r of rows) {
      lines.push(
        [
          r.ownerName,
          r.phone,
          r.email,
          r.mailingAddress,
          r.mailingCity,
          r.mailingState,
          r.mailingZip,
          r.pin,
          r.situsAddress,
          r.propType,
          r.score,
          r.isEntity,
          r.isAbsentee,
        ]
          .map(csvEscape)
          .join(','),
      );
    }

    return {
      count: rows.length,
      csv: lines.join('\n'),
      items: rows,
    };
  }
}

function csvEscape(value: unknown): string {
  const s = value == null ? '' : String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
