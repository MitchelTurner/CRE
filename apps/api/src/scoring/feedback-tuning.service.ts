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
 * Nudge score weights from thumbs-down feedback so recurring weak patterns
 * lose influence (land-use / absentee / entity). Conservative ±2 caps.
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
    for (const f of feedback) {
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

    // If downvoted leads lean hard on a component, gently reduce its weight.
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
      this.logger.log(`Tuned score weights from ${feedback.length} downvotes: ${JSON.stringify(adjusted)}`);
    }

    return { samples: feedback.length, adjusted, weights };
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n));
}
