import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';

/**
 * M6 — Registered Agent Graph.
 * Ranks local attorneys/CPAs by commercial parcels represented.
 * Blocklists high-volume commercial RA services (CT Corp, CSC, etc.).
 */
@Injectable()
export class AgentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private blocklist(): string[] {
    const extra = (this.config.get<string>('registeredAgentBlocklist') ?? '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    return [
      'ct corporation',
      'corporation service company',
      'csc',
      'registered agents inc',
      'northwest registered agent',
      'legalzoom',
      'harbor compliance',
      ...extra,
    ];
  }

  async rank(limit = 15) {
    const contacts = await this.prisma.contact.findMany({
      where: { role: 'registered_agent' },
      include: {
        owner: {
          include: {
            parcels: {
              where: { isActive: true, isCommercial: true },
              include: {
                scores: { orderBy: { scoredAt: 'desc' }, take: 1 },
              },
            },
          },
        },
      },
    });

    // Also fold SoS registered agent name on Owner when Contact missing
    const ownersWithSos = await this.prisma.owner.findMany({
      where: {
        sosRegisteredAgent: { not: null },
        parcels: { some: { isActive: true, isCommercial: true } },
      },
      include: {
        parcels: {
          where: { isActive: true, isCommercial: true },
          include: { scores: { orderBy: { scoredAt: 'desc' }, take: 1 } },
        },
      },
      take: 5000,
    });

    type Agg = {
      name: string;
      address: string | null;
      ownerIds: Set<string>;
      parcelIds: Set<string>;
      scoreSum: number;
    };
    const byKey = new Map<string, Agg>();
    const blocked = this.blocklist();

    const add = (
      nameRaw: string,
      address: string | null,
      ownerId: string,
      parcels: Array<{ id: string; scores: Array<{ total: number }> }>,
    ) => {
      const name = nameRaw.trim();
      if (!name) return;
      const key = name.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
      if (blocked.some((b) => key.includes(b))) return;
      let agg = byKey.get(key);
      if (!agg) {
        agg = { name, address, ownerIds: new Set(), parcelIds: new Set(), scoreSum: 0 };
        byKey.set(key, agg);
      }
      agg.ownerIds.add(ownerId);
      for (const p of parcels) {
        if (agg.parcelIds.has(p.id)) continue;
        agg.parcelIds.add(p.id);
        agg.scoreSum += p.scores[0]?.total ?? 0;
      }
    };

    for (const c of contacts) {
      add(c.name || 'Unknown', c.owner.sosAgentAddress ?? null, c.ownerId, c.owner.parcels);
    }
    for (const o of ownersWithSos) {
      if (o.sosRegisteredAgent) {
        add(o.sosRegisteredAgent, o.sosAgentAddress ?? null, o.id, o.parcels);
      }
    }

    const items = [...byKey.values()]
      .map((a) => ({
        name: a.name,
        address: a.address,
        ownerCount: a.ownerIds.size,
        parcelCount: a.parcelIds.size,
        scoreSum: a.scoreSum,
      }))
      .sort((x, y) => y.parcelCount - x.parcelCount || y.scoreSum - x.scoreSum)
      .slice(0, Math.min(limit, 100));

    return { items };
  }
}
