import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface ParcelListQuery {
  minScore?: number;
  landUse?: string;
  absentee?: boolean;
  hotOnly?: boolean;
  missingContact?: boolean;
  sort?: 'score';
  limit?: number;
  offset?: number;
}

@Injectable()
export class ParcelsService {
  private readonly logger = new Logger(ParcelsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(query: ParcelListQuery) {
    const limit = Math.min(query.limit ?? 50, 200);
    const offset = query.offset ?? 0;

    const filters: Prisma.Sql[] = [
      Prisma.sql`p."isActive" = true`,
      Prisma.sql`p."isCommercial" = true`,
    ];

    // Only apply when > 0 so unscored parcels still appear before/during first scoring run.
    if (typeof query.minScore === 'number' && !Number.isNaN(query.minScore) && query.minScore > 0) {
      filters.push(Prisma.sql`s.total >= ${query.minScore}`);
    }
    if (query.landUse) {
      filters.push(Prisma.sql`p."landUseCode" = ${query.landUse}`);
    }
    if (typeof query.absentee === 'boolean') {
      filters.push(Prisma.sql`o."isAbsentee" = ${query.absentee}`);
    }

    try {
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
      >(Prisma.sql`
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
        WHERE ${Prisma.join(filters, ' AND ')}
        ORDER BY s.total DESC NULLS LAST
        LIMIT ${limit} OFFSET ${offset}
      `);

      const enriched = await this.attachListMeta(rows, query);
      return { items: enriched, limit, offset };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Raw parcel list query failed; using Prisma fallback: ${message}`);
      return this.listWithPrismaClient(query, limit, offset);
    }
  }

  private async attachListMeta<
    T extends { id: string; pin: string; components: unknown },
  >(rows: T[], query: ParcelListQuery) {
    if (!rows.length) return [];
    const now = new Date();
    const ids = rows.map((r) => r.id);
    const [signals, parcelsWithOwner, leads] = await Promise.all([
      this.prisma.signal.findMany({
        where: {
          parcelId: { in: ids },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        select: { parcelId: true, type: true },
      }),
      this.prisma.parcel.findMany({
        where: { id: { in: ids } },
        select: {
          id: true,
          ownerId: true,
          owner: {
            select: {
              contacts: {
                where: { OR: [{ phone: { not: null } }, { email: { not: null } }] },
                take: 1,
                select: { id: true },
              },
            },
          },
        },
      }),
      this.prisma.lead.findMany({
        where: { parcelId: { in: ids }, status: { not: 'dead' } },
        orderBy: { createdAt: 'desc' },
        select: { parcelId: true, whyNow: true },
      }),
    ]);

    const signalsByParcel = new Map<string, string[]>();
    for (const s of signals) {
      const list = signalsByParcel.get(s.parcelId) ?? [];
      list.push(s.type);
      signalsByParcel.set(s.parcelId, list);
    }

    const hasContact = new Set<string>();
    for (const p of parcelsWithOwner) {
      if (p.owner?.contacts?.length) hasContact.add(p.id);
    }

    const whyByParcel = new Map<string, string>();
    for (const l of leads) {
      if (!whyByParcel.has(l.parcelId)) whyByParcel.set(l.parcelId, l.whyNow);
    }

    const hotTypes = new Set([
      'tax_delinquent',
      'mortgage_maturity',
      'foreclosure',
      'recent_seller',
      'sos_dissolved',
      'zoning_change',
      'permit_activity',
      'nearby_listing',
      'probate_estate',
      'tax_sale',
    ]);

    let items = rows.map((r) => {
      const signalTypes = [...new Set(signalsByParcel.get(r.id) ?? [])];
      return {
        ...r,
        signalTypes,
        hasContact: hasContact.has(r.id),
        whyNow: whyByParcel.get(r.id) ?? null,
        hot: signalTypes.some((t) => hotTypes.has(t)),
      };
    });

    if (query.hotOnly) items = items.filter((i) => i.hot);
    if (query.missingContact) items = items.filter((i) => !i.hasContact);
    return items;
  }

  private async listWithPrismaClient(
    query: ParcelListQuery,
    limit: number,
    offset: number,
  ) {
    const parcels = await this.prisma.parcel.findMany({
      where: {
        isActive: true,
        isCommercial: true,
        ...(query.landUse ? { landUseCode: query.landUse } : {}),
        ...(typeof query.absentee === 'boolean'
          ? { owner: { isAbsentee: query.absentee } }
          : {}),
      },
      include: {
        owner: { select: { nameRaw: true, isAbsentee: true } },
        scores: {
          orderBy: { scoredAt: 'desc' },
          take: 1,
          select: { total: true, scoredAt: true, components: true },
        },
      },
      take: 5000,
    });

    const minScore = query.minScore ?? 0;
    const items = parcels
      .map((p) => {
        const latest = p.scores[0];
        return {
          id: p.id,
          pin: p.pin,
          situsAddress: p.situsAddress,
          landUseCode: p.landUseCode,
          propType: p.propType,
          deedDate: p.deedDate,
          isAbsentee: p.owner?.isAbsentee ?? null,
          ownerName: p.owner?.nameRaw ?? null,
          score: latest?.total ?? null,
          scoredAt: latest?.scoredAt ?? null,
          components: latest?.components ?? null,
        };
      })
      .filter((p) => (minScore > 0 ? (p.score ?? -1) >= minScore : true))
      .sort((a, b) => (b.score ?? -1) - (a.score ?? -1))
      .slice(offset, offset + limit);

    return { items, limit, offset };
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

  async mapPoints(query: { minScore?: number; limit?: number }) {
    const limit = Math.min(query.limit ?? 400, 1000);
    const minScore = query.minScore ?? 0;

    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        pin: string;
        situsAddress: string | null;
        latitude: number;
        longitude: number;
        score: number | null;
        propType: string | null;
      }>
    >`
      SELECT
        p.id,
        p.pin,
        p."situsAddress",
        p.latitude,
        p.longitude,
        p."propType",
        s.total AS score
      FROM "Parcel" p
      LEFT JOIN LATERAL (
        SELECT total FROM "Score" WHERE "parcelId" = p.id ORDER BY "scoredAt" DESC LIMIT 1
      ) s ON true
      WHERE p."isActive" = true
        AND p."isCommercial" = true
        AND p.latitude IS NOT NULL
        AND p.longitude IS NOT NULL
        AND (${minScore} = 0 OR s.total >= ${minScore})
      ORDER BY s.total DESC NULLS LAST
      LIMIT ${limit}
    `;

    return { items: rows, bounds: {
      minLat: 34.65,
      maxLat: 35.15,
      minLon: -82.65,
      maxLon: -82.15,
    } };
  }
}
