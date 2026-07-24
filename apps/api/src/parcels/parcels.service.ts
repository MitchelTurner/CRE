import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface ParcelListQuery {
  minScore?: number;
  landUse?: string;
  absentee?: boolean;
  sort?: 'score';
  limit?: number;
  offset?: number;
}

@Injectable()
export class ParcelsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ParcelListQuery) {
    const limit = Math.min(query.limit ?? 50, 200);
    const offset = query.offset ?? 0;

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        pin: string;
        situsAddress: string | null;
        landUseCode: string | null;
        propType: string | null;
        deedDate: Date | null;
        isAbsentee: boolean | null;
        ownerName: string | null;
        score: number | null;
        scoredAt: Date | null;
        components: unknown;
      }>
    >`
      SELECT
        p.id,
        p.pin,
        p."situsAddress",
        p."landUseCode",
        p."propType",
        p."deedDate",
        o."isAbsentee",
        o."nameRaw" AS "ownerName",
        s.total AS score,
        s."scoredAt",
        s.components
      FROM "Parcel" p
      LEFT JOIN "Owner" o ON o.id = p."ownerId"
      LEFT JOIN LATERAL (
        SELECT total, "scoredAt", components
        FROM "Score"
        WHERE "parcelId" = p.id
        ORDER BY "scoredAt" DESC
        LIMIT 1
      ) s ON true
      WHERE p."isActive" = true
        AND p."isCommercial" = true
        AND (${query.minScore ?? null}::int IS NULL OR s.total >= ${query.minScore ?? null})
        AND (${query.landUse ?? null}::text IS NULL OR p."landUseCode" = ${query.landUse ?? null})
        AND (${query.absentee ?? null}::boolean IS NULL OR o."isAbsentee" = ${query.absentee ?? null})
      ORDER BY s.total DESC NULLS LAST
      LIMIT ${limit} OFFSET ${offset}
    `;

    return { items: rows, limit, offset };
  }

  async getByPin(pin: string) {
    const parcel = await this.prisma.parcel.findUnique({
      where: { pin },
      include: {
        owner: {
          include: {
            parcels: {
              where: { isActive: true, isCommercial: true },
              select: {
                pin: true,
                situsAddress: true,
                landUseCode: true,
                propType: true,
              },
            },
            contacts: true,
          },
        },
        scores: { orderBy: { scoredAt: 'desc' }, take: 10 },
        signals: { orderBy: { detectedAt: 'desc' } },
        leads: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });

    if (!parcel) {
      throw new NotFoundException(`Parcel ${pin} not found`);
    }

    return parcel;
  }
}