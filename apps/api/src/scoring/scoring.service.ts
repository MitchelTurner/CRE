import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { scoreParcel } from '@cre/shared';
import { AppConfigService } from '../app-config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { WhyNowService } from './why-now.service';

export interface ScoringRunResult {
  scored: number;
  syncRunId: string;
}

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
      const [weights, landUsePriority] = await Promise.all([
        this.appConfig.getScoreWeights(),
        this.appConfig.getLandUsePriority(),
      ]);
      const scoreVersion = this.config.get<string>('scoreVersion') ?? 'v1';
      const homeState = this.config.get<string>('countyHomeState') ?? 'SC';

      // Precompute parcel counts per owner for multi-parcel component
      const ownerCounts = await this.prisma.parcel.groupBy({
        by: ['ownerId'],
        where: { isActive: true, isCommercial: true, ownerId: { not: null } },
        _count: { _all: true },
      });
      const countByOwner = new Map<string, number>();
      for (const row of ownerCounts) {
        if (row.ownerId) countByOwner.set(row.ownerId, row._count._all);
      }

      const parcels = await this.prisma.parcel.findMany({
        where: { isActive: true, isCommercial: true },
        include: { owner: true },
      });

      let scored = 0;
      for (const parcel of parcels) {
        const owner = parcel.owner;
        const ownerCount = owner ? (countByOwner.get(owner.id) ?? 1) : 1;
        const mailingStreet =
          owner?.mailingAddress?.split(',')[0]?.trim() ?? owner?.mailingAddress ?? null;

        const { total, components } = scoreParcel({
          deedDate: parcel.deedDate,
          mailingStreet,
          situsAddress: parcel.situsAddress,
          mailingState: owner?.mailingState,
          ownerName: owner?.nameRaw ?? 'UNKNOWN',
          activeCommercialParcelCount: ownerCount,
          landUseCode: parcel.landUseCode,
          landUsePriorityMap: landUsePriority,
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

  /** Expose whyNow for digest generation. */
  buildWhyNow(input: Parameters<WhyNowService['generate']>[0]): string {
    return this.whyNow.generate(input);
  }
}