import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { buildExplanation, softScore } from './requirement-matching.logic';

export type RequirementInput = {
  clientName: string;
  minSf?: number | null;
  maxSf?: number | null;
  minClearHeight?: number | null;
  minDockDoors?: number | null;
  minYardAcres?: number | null;
  railRequired?: boolean;
  submarkets?: string[];
  notes?: string | null;
  isActive?: boolean;
};

export type CanvassMatch = {
  parcelId: string;
  pin: string;
  situsAddress: string | null;
  submarket: string | null;
  propType: string | null;
  ownerName: string | null;
  ownerId: string | null;
  isListed: boolean;
  score: number;
  matchExplanation: string;
  buildingSf: number | null;
  clearHeightFt: number | null;
  dockDoors: number | null;
  yardAcres: number | null;
  railServed: boolean | null;
  verifiedAt: string | null;
};

@Injectable()
export class RequirementMatchingService {
  constructor(private readonly prisma: PrismaService) {}

  list(activeOnly = true) {
    return this.prisma.requirement.findMany({
      where: activeOnly ? { isActive: true } : undefined,
      orderBy: { createdAt: 'desc' },
    });
  }

  get(id: string) {
    return this.prisma.requirement.findUnique({ where: { id } });
  }

  create(body: RequirementInput) {
    return this.prisma.requirement.create({
      data: {
        clientName: body.clientName.trim(),
        minSf: body.minSf ?? null,
        maxSf: body.maxSf ?? null,
        minClearHeight: body.minClearHeight ?? null,
        minDockDoors: body.minDockDoors ?? null,
        minYardAcres: body.minYardAcres ?? null,
        railRequired: Boolean(body.railRequired),
        submarkets: body.submarkets ?? [],
        notes: body.notes?.trim() || null,
        isActive: body.isActive !== false,
      },
    });
  }

  async update(id: string, body: Partial<RequirementInput>) {
    const existing = await this.prisma.requirement.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Requirement not found');
    return this.prisma.requirement.update({
      where: { id },
      data: {
        clientName: body.clientName?.trim() ?? undefined,
        minSf: body.minSf === undefined ? undefined : body.minSf,
        maxSf: body.maxSf === undefined ? undefined : body.maxSf,
        minClearHeight:
          body.minClearHeight === undefined ? undefined : body.minClearHeight,
        minDockDoors: body.minDockDoors === undefined ? undefined : body.minDockDoors,
        minYardAcres: body.minYardAcres === undefined ? undefined : body.minYardAcres,
        railRequired: body.railRequired === undefined ? undefined : Boolean(body.railRequired),
        submarkets: body.submarkets === undefined ? undefined : body.submarkets,
        notes: body.notes === undefined ? undefined : body.notes?.trim() || null,
        isActive: body.isActive === undefined ? undefined : body.isActive,
      },
    });
  }

  async match(requirementId: string, limit = 50): Promise<{
    requirement: NonNullable<Awaited<ReturnType<RequirementMatchingService['get']>>>;
    matches: CanvassMatch[];
  }> {
    const requirement = await this.get(requirementId);
    if (!requirement) throw new NotFoundException('Requirement not found');

    const attrs = await this.prisma.buildingAttributes.findMany({
      where: {
        OR: [
          { buildingSf: { not: null } },
          { clearHeightFt: { not: null } },
          { yardAcres: { not: null } },
          { dockDoors: { not: null } },
        ],
      },
    });
    if (!attrs.length) {
      return { requirement, matches: [] };
    }

    const parcelIds = attrs.map((a) => a.parcelId);
    const parcels = await this.prisma.parcel.findMany({
      where: { id: { in: parcelIds }, isActive: true },
      include: { owner: { select: { id: true, nameRaw: true } } },
    });
    const parcelMap = new Map(parcels.map((p) => [p.id, p]));

    const listingSignals = await this.prisma.signal.findMany({
      where: {
        parcelId: { in: parcelIds },
        type: { in: ['nearby_listing', 'vacancy_proxy'] },
        OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }],
      },
      select: { parcelId: true },
    });
    const listedFromSignal = new Set(listingSignals.map((s) => s.parcelId));

    const matches: CanvassMatch[] = [];
    for (const a of attrs) {
      const parcel = parcelMap.get(a.parcelId);
      if (!parcel) continue;

      // Hard filters
      const sf = a.buildingSf;
      if (requirement.minSf != null && (sf == null || sf < requirement.minSf)) continue;
      if (requirement.maxSf != null && (sf == null || sf > requirement.maxSf)) continue;
      if (requirement.railRequired && a.railServed !== true) continue;
      if (requirement.submarkets.length) {
        const sm = (parcel.submarket || '').toLowerCase();
        if (!requirement.submarkets.some((s) => sm.includes(s.toLowerCase()))) continue;
      }

      const isListed = a.isListed || listedFromSignal.has(a.parcelId);
      const soft = softScore(requirement, a);
      // Off-market ranks above listed (spec).
      const score = soft + (isListed ? 0 : 25);
      const matchExplanation = buildExplanation(requirement, a, isListed);

      matches.push({
        parcelId: parcel.id,
        pin: parcel.pin,
        situsAddress: parcel.situsAddress,
        submarket: parcel.submarket,
        propType: parcel.propType,
        ownerName: parcel.owner?.nameRaw ?? null,
        ownerId: parcel.owner?.id ?? null,
        isListed,
        score,
        matchExplanation,
        buildingSf: a.buildingSf,
        clearHeightFt: a.clearHeightFt,
        dockDoors: a.dockDoors,
        yardAcres: a.yardAcres,
        railServed: a.railServed,
        verifiedAt: a.verifiedAt?.toISOString() ?? null,
      });
    }

    matches.sort((x, y) => y.score - x.score || Number(x.isListed) - Number(y.isListed));
    return { requirement, matches: matches.slice(0, limit) };
  }

  toCsv(matches: CanvassMatch[]): string {
    const headers = [
      'pin',
      'address',
      'submarket',
      'owner',
      'listed',
      'score',
      'buildingSf',
      'clearHeightFt',
      'dockDoors',
      'yardAcres',
      'railServed',
      'matchExplanation',
    ];
    const lines = [headers.join(',')];
    for (const m of matches) {
      lines.push(
        [
          csv(m.pin),
          csv(m.situsAddress),
          csv(m.submarket),
          csv(m.ownerName),
          m.isListed ? 'listed' : 'off-market',
          String(m.score.toFixed(1)),
          m.buildingSf ?? '',
          m.clearHeightFt ?? '',
          m.dockDoors ?? '',
          m.yardAcres ?? '',
          m.railServed == null ? '' : m.railServed ? 'yes' : 'no',
          csv(m.matchExplanation),
        ].join(','),
      );
    }
    return lines.join('\n');
  }
}

function csv(v: string | null | undefined): string {
  const s = v ?? '';
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}
