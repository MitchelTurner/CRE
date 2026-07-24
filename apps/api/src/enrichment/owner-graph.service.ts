import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { SignalService } from './signal.service';

@Injectable()
export class OwnerGraphService {
  private readonly logger = new Logger(OwnerGraphService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly signals: SignalService,
  ) {}

  /**
   * Cluster owners by mailing clusterKey and shared registered agent;
   * store relatedOwnerIds + portfolioScore; emit related_entity signals.
   */
  async rebuildClusters(): Promise<{ ownersUpdated: number; signals: number }> {
    const owners = await this.prisma.owner.findMany({
      include: {
        parcels: {
          where: { isActive: true, isCommercial: true },
          select: { id: true },
        },
      },
    });

    const byCluster = new Map<string, string[]>();
    const byAgent = new Map<string, string[]>();

    for (const o of owners) {
      if (o.clusterKey) {
        const list = byCluster.get(o.clusterKey) ?? [];
        list.push(o.id);
        byCluster.set(o.clusterKey, list);
      }
      const agent = (o.sosRegisteredAgent || '').toUpperCase().replace(/\s+/g, ' ').trim();
      if (agent && agent.length > 3) {
        const list = byAgent.get(agent) ?? [];
        list.push(o.id);
        byAgent.set(agent, list);
      }
    }

    let ownersUpdated = 0;
    let signals = 0;

    for (const o of owners) {
      const related = new Set<string>();
      if (o.clusterKey) {
        for (const id of byCluster.get(o.clusterKey) ?? []) {
          if (id !== o.id) related.add(id);
        }
      }
      const agent = (o.sosRegisteredAgent || '').toUpperCase().replace(/\s+/g, ' ').trim();
      if (agent) {
        for (const id of byAgent.get(agent) ?? []) {
          if (id !== o.id) related.add(id);
        }
      }

      let relatedParcelCount = o.parcels.length;
      if (related.size) {
        const relatedParcels = await this.prisma.parcel.count({
          where: {
            ownerId: { in: [...related] },
            isActive: true,
            isCommercial: true,
          },
        });
        relatedParcelCount += relatedParcels;
      }

      const portfolioScore = Math.min(100, o.parcels.length * 10 + related.size * 5);
      await this.prisma.owner.update({
        where: { id: o.id },
        data: {
          relatedOwnerIds: [...related] as unknown as Prisma.InputJsonValue,
          portfolioScore,
        },
      });
      ownersUpdated += 1;

      if (related.size > 0 && o.parcels.length) {
        for (const parcel of o.parcels.slice(0, 5)) {
          await this.signals.upsertSignal({
            parcelId: parcel.id,
            type: 'related_entity',
            payload: {
              relatedOwnerCount: related.size,
              relatedCommercialParcelCount: relatedParcelCount,
              clusterKey: o.clusterKey,
            },
          });
          signals += 1;
        }
      }
    }

    this.logger.log(`Owner graph rebuilt: owners=${ownersUpdated} signals=${signals}`);
    return { ownersUpdated, signals };
  }

  async relatedParcelCountForOwner(ownerId: string): Promise<number> {
    const owner = await this.prisma.owner.findUnique({
      where: { id: ownerId },
      select: { relatedOwnerIds: true },
    });
    const related = Array.isArray(owner?.relatedOwnerIds)
      ? (owner!.relatedOwnerIds as string[])
      : [];
    const ids = [ownerId, ...related];
    return this.prisma.parcel.count({
      where: { ownerId: { in: ids }, isActive: true, isCommercial: true },
    });
  }
}
