import { Injectable } from '@nestjs/common';
import { HOT_SIGNAL_TYPES } from '@cre/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async today() {
    const now = new Date();
    const hotTypes = [...HOT_SIGNAL_TYPES];

    const [
      hitlPending,
      runningJobs,
      recentJobs,
      callQueue,
      hotSignals,
      parcelCount,
      scoredCount,
    ] = await Promise.all([
      this.prisma.enrichmentReview.count({ where: { status: 'pending' } }),
      this.prisma.syncRun.findMany({
        where: { status: 'running' },
        orderBy: { startedAt: 'desc' },
        take: 5,
      }),
      this.prisma.syncRun.findMany({
        orderBy: { startedAt: 'desc' },
        take: 8,
      }),
      this.prisma.lead.findMany({
        where: {
          status: { in: ['new', 'sent', 'contacted'] },
          OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: now } }],
        },
        orderBy: { updatedAt: 'desc' },
        take: 5,
        include: {
          parcel: {
            include: {
              owner: {
                include: {
                  contacts: { orderBy: { createdAt: 'desc' }, take: 1 },
                },
              },
              scores: { orderBy: { scoredAt: 'desc' }, take: 1, select: { total: true } },
              signals: {
                where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
                select: { type: true },
                take: 8,
              },
            },
          },
        },
      }),
      this.prisma.signal.findMany({
        where: {
          type: { in: hotTypes },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          detectedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
        },
        orderBy: { detectedAt: 'desc' },
        take: 12,
        include: {
          parcel: {
            select: {
              pin: true,
              situsAddress: true,
              scores: { orderBy: { scoredAt: 'desc' }, take: 1, select: { total: true } },
            },
          },
        },
      }),
      this.prisma.parcel.count({ where: { isActive: true, isCommercial: true } }),
      this.prisma.score.groupBy({
        by: ['parcelId'],
        _count: { _all: true },
      }).then((rows) => rows.length),
    ]);

    return {
      stats: {
        hitlPending,
        commercialParcels: parcelCount,
        scoredParcels: scoredCount,
        runningJobs: runningJobs.length,
      },
      runningJobs,
      recentJobs,
      callQueue: callQueue.map((l) => ({
        leadId: l.id,
        status: l.status,
        whyNow: l.whyNow,
        lastOutcome: l.lastOutcome,
        pin: l.parcel.pin,
        situsAddress: l.parcel.situsAddress,
        score: l.parcel.scores[0]?.total ?? null,
        ownerName: l.parcel.owner?.nameRaw ?? null,
        phone: l.parcel.owner?.contacts[0]?.phone ?? null,
        email: l.parcel.owner?.contacts[0]?.email ?? null,
        signalTypes: [...new Set(l.parcel.signals.map((s) => s.type))],
      })),
      hotCatalysts: hotSignals.map((s) => ({
        signalType: s.type,
        detectedAt: s.detectedAt,
        pin: s.parcel.pin,
        situsAddress: s.parcel.situsAddress,
        score: s.parcel.scores[0]?.total ?? null,
      })),
    };
  }
}
