import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { mergeScoreWeights, scoreParcel, type SignalType } from '@cre/shared';
import { AppConfigService } from '../app-config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhyNowService } from './why-now.service';

export interface ScoringRunResult {
  scored: number;
  syncRunId: string;
}

const KNOWN_SIGNAL_TYPES = new Set<SignalType>([
  'tax_delinquent',
  'mortgage_maturity',
  'foreclosure',
  'recent_seller',
  'sos_dissolved',
  'sos_resolved',
  'zoning_change',
  'permit_activity',
  'nearby_listing',
  'probate_estate',
  'flood_zone',
  'related_entity',
  'tax_sale',
  'deed_comp',
  'judgment_lien',
  'vacancy_proxy',
]);

@Injectable()
export class ScoringService {
  private readonly logger = new Logger(ScoringService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
    private readonly config: ConfigService,
    private readonly whyNow: WhyNowService,
  ) {}

  async runAll(): Promise<ScoringRunResult> {
    const syncRun = await this.prisma.syncRun.create({
      data: { source: 'scoring_run_all', status: 'running' },
    });

    try {
      const [rawWeights, landUsePriority] = await Promise.all([
        this.appConfig.getScoreWeights(),
        this.appConfig.getLandUsePriority(),
      ]);
      const weights = mergeScoreWeights(rawWeights);
      const scoreVersion = this.config.get<string>('scoreVersion') ?? 'v3';
      const homeState = this.config.get<string>('countyHomeState') ?? 'SC';

      const ownerCounts = await this.prisma.parcel.groupBy({
        by: ['ownerId'],
        where: { isActive: true, isCommercial: true, ownerId: { not: null } },
        _count: { _all: true },
      });
      const countByOwner = new Map<string, number>();
      for (const row of ownerCounts) {
        if (row.ownerId) countByOwner.set(row.ownerId, row._count._all);
      }

      // Precompute related parcel counts from graph JSON
      const owners = await this.prisma.owner.findMany({
        select: { id: true, relatedOwnerIds: true },
      });
      const relatedCountByOwner = new Map<string, number>();
      for (const o of owners) {
        const related = Array.isArray(o.relatedOwnerIds) ? (o.relatedOwnerIds as string[]) : [];
        const own = countByOwner.get(o.id) ?? 0;
        let relatedParcels = 0;
        for (const rid of related) relatedParcels += countByOwner.get(rid) ?? 0;
        relatedCountByOwner.set(o.id, own + relatedParcels);
      }

      const now = new Date();
      const parcels = await this.prisma.parcel.findMany({
        where: { isActive: true, isCommercial: true },
        include: {
          owner: true,
          signals: {
            where: {
              OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
            },
            select: { type: true, payload: true },
          },
        },
      });

      const prioritySubmarkets = await this.appConfig.getJson<string[]>(
        'priority_submarkets',
        ['downtown', 'woodruff', 'airport', 'pelham'],
      );

      let scored = 0;
      for (const parcel of parcels) {
        const owner = parcel.owner;
        const ownerCount = owner ? (countByOwner.get(owner.id) ?? 1) : 1;
        const relatedCount = owner
          ? (relatedCountByOwner.get(owner.id) ?? ownerCount)
          : ownerCount;
        const mailingStreet =
          owner?.mailingAddress?.split(',')[0]?.trim() ?? owner?.mailingAddress ?? null;
        const signalTypes = [
          ...new Set(
            parcel.signals
              .map((s) => s.type)
              .filter((t): t is SignalType => KNOWN_SIGNAL_TYPES.has(t as SignalType)),
          ),
        ];

        const mtgPayload = parcel.signals.find((s) => s.type === 'mortgage_maturity')
          ?.payload as { loanAmount?: number; amount?: number } | null;
        const taxPayload = parcel.signals.find((s) => s.type === 'tax_delinquent')
          ?.payload as { yearsDelinquent?: number; totalTax?: number } | null;

        const { total, components } = scoreParcel({
          deedDate: parcel.deedDate,
          mailingStreet,
          situsAddress: parcel.situsAddress,
          mailingState: owner?.mailingState,
          ownerName: owner?.nameRaw ?? 'UNKNOWN',
          activeCommercialParcelCount: ownerCount,
          relatedCommercialParcelCount: relatedCount,
          landUseCode: parcel.landUseCode,
          landUsePriorityMap: landUsePriority,
          paidDate: parcel.paidDate,
          totalTax: taxPayload?.totalTax ?? parcel.totalTax,
          fairMarketVal: parcel.fairMarketVal,
          loanAmount: mtgPayload?.loanAmount ?? mtgPayload?.amount ?? null,
          yearsDelinquent: taxPayload?.yearsDelinquent ?? null,
          submarket: parcel.submarket,
          prioritySubmarkets,
          signalTypes,
          homeState,
          weights,
        });

        await this.prisma.score.create({
          data: {
            parcelId: parcel.id,
            total,
            components: components as unknown as Prisma.InputJsonValue,
            scoreVersion,
          },
        });
        scored += 1;
      }

      await this.prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: 'success',
          finishedAt: new Date(),
          recordsSeen: parcels.length,
          recordsUpserted: scored,
        },
      });

      this.logger.log(`Scored ${scored} commercial parcels`);
      return { scored, syncRunId: syncRun.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          error: message,
        },
      });
      throw err;
    }
  }

  buildWhyNow(input: Parameters<WhyNowService['generate']>[0]): string {
    return this.whyNow.generate(input);
  }
}
