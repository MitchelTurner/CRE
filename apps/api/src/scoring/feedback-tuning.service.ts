import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  CONFIG_KEYS,
  DEFAULT_SCORE_WEIGHTS,
  mergeScoreWeights,
  type ScoreComponents,
  type ScoreWeights,
} from '@cre/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../app-config/app-config.service';

export interface TuningResult {
  samples: number;
  adjusted: Partial<ScoreWeights>;
  weights: ScoreWeights;
}

/**
 * Nudge score weights from thumbs-down feedback (+ reason hints).
 * Conservative clamps so one bad week cannot zero a catalyst.
 */
@Injectable()
export class FeedbackTuningService {
  private readonly logger = new Logger(FeedbackTuningService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly appConfig: AppConfigService,
  ) {}

  async tuneFromFeedback(minSamples = 5): Promise<TuningResult> {
    const feedback = await this.prisma.leadFeedback.findMany({
      where: { rating: 'down' },
      orderBy: { createdAt: 'desc' },
      take: 200,
      include: {
        lead: {
          include: {
            parcel: {
              include: {
                scores: { orderBy: { scoredAt: 'desc' }, take: 1 },
              },
            },
          },
        },
      },
    });

    if (feedback.length < minSamples) {
      const weights = mergeScoreWeights(await this.appConfig.getScoreWeights());
      return { samples: feedback.length, adjusted: {}, weights };
    }

    const sums: Record<string, number> = {};
    const counts: Record<string, number> = {};
    const reasonCounts: Record<string, number> = {};
    for (const f of feedback) {
      if (f.reason) reasonCounts[f.reason] = (reasonCounts[f.reason] ?? 0) + 1;
      const components = f.lead.parcel.scores[0]?.components as ScoreComponents | undefined;
      if (!components) continue;
      for (const [key, value] of Object.entries(components)) {
        if (typeof value !== 'number' || key === 'missingDeedDate') continue;
        sums[key] = (sums[key] ?? 0) + value;
        counts[key] = (counts[key] ?? 0) + 1;
      }
    }

    const avgs = Object.fromEntries(
      Object.keys(sums).map((k) => [k, sums[k]! / (counts[k] || 1)]),
    );

    const current = mergeScoreWeights(await this.appConfig.getScoreWeights());
    const adjusted: Partial<ScoreWeights> = {};

    if ((avgs.landUsePriority ?? 0) >= 10) {
      adjusted.landUsePriorityMax = clamp(
        current.landUsePriorityMax - 2,
        5,
        DEFAULT_SCORE_WEIGHTS.landUsePriorityMax,
      );
    }
    if ((avgs.absentee ?? 0) >= 20) {
      adjusted.absenteeOutOfState = clamp(current.absenteeOutOfState - 2, 10, 25);
      adjusted.absenteeInState = clamp(current.absenteeInState - 1, 5, 15);
    }
    if ((avgs.entity ?? 0) >= 8 && (avgs.holdPeriod ?? 0) < 20) {
      adjusted.entity = clamp(current.entity - 2, 0, 10);
    }
    if ((avgs.multiParcel ?? 0) >= 8) {
      adjusted.multiParcel = clamp(current.multiParcel - 1, 0, 10);
    }
    // Catalyst components that dominate downvotes — soft nudge only.
    if ((avgs.mortgageMaturity ?? 0) >= 15 && (reasonCounts.bad_timing ?? 0) >= 3) {
      adjusted.mortgageMaturity = clamp(current.mortgageMaturity - 2, 10, 25);
    }
    if ((avgs.zoningWatch ?? 0) >= 10 && (reasonCounts.wrong_asset ?? 0) >= 3) {
      adjusted.zoningWatch = clamp(current.zoningWatch - 2, 4, 15);
    }
    if ((avgs.probateEstate ?? 0) >= 12) {
      adjusted.probateEstate = clamp(current.probateEstate - 2, 8, 20);
    }
    if ((avgs.nearbyListing ?? 0) >= 5 && (reasonCounts.wrong_asset ?? 0) >= 2) {
      adjusted.nearbyListing = clamp(current.nearbyListing - 1, 2, 10);
    }
    if ((avgs.judgmentLien ?? 0) >= 10) {
      adjusted.judgmentLien = clamp(current.judgmentLien - 2, 4, 15);
    }
    if ((avgs.taxSeverity ?? 0) >= 6 && (reasonCounts.bad_timing ?? 0) >= 2) {
      adjusted.taxSeverityMax = clamp(current.taxSeverityMax - 1, 2, 10);
    }
    if ((avgs.loanPressure ?? 0) >= 6 && (reasonCounts.bad_timing ?? 0) >= 2) {
      adjusted.loanPressureMax = clamp(current.loanPressureMax - 1, 2, 10);
    }
    if ((avgs.vacancyProxy ?? 0) >= 5 && (reasonCounts.wrong_asset ?? 0) >= 2) {
      adjusted.vacancyProxy = clamp(current.vacancyProxy - 1, 2, 10);
    }
    if ((avgs.submarketFit ?? 0) >= 3 && (reasonCounts.wrong_asset ?? 0) >= 3) {
      adjusted.submarketFitMax = clamp(current.submarketFitMax - 1, 0, 6);
    }

    const weights = mergeScoreWeights({ ...current, ...adjusted });
    if (Object.keys(adjusted).length) {
      await this.prisma.appConfig.upsert({
        where: { key: CONFIG_KEYS.SCORE_WEIGHTS },
        create: {
          key: CONFIG_KEYS.SCORE_WEIGHTS,
          value: weights as unknown as Prisma.InputJsonValue,
        },
        update: { value: weights as unknown as Prisma.InputJsonValue },
      });
      this.logger.log(
        `Tuned score weights from ${feedback.length} downvotes: ${JSON.stringify(adjusted)} reasons=${JSON.stringify(reasonCounts)}`,
      );
    }

    return { samples: feedback.length, adjusted, weights };
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
