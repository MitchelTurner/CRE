import { Injectable, Logger } from '@nestjs/common';
import { computeSpaceScore } from '@cre/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SpaceScoreService {
  private readonly logger = new Logger(SpaceScoreService.name);
  private readonly pending = new Set<string>();
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Debounced recompute — coalesces bursts of signal inserts per company. */
  enqueue(companyId: string) {
    this.pending.add(companyId);
    if (this.timer) return;
    this.timer = setTimeout(() => {
      const ids = [...this.pending];
      this.pending.clear();
      this.timer = null;
      void Promise.all(ids.map((id) => this.recompute(id))).catch((err) =>
        this.logger.warn(
          `SpaceScore batch failed: ${err instanceof Error ? err.message : String(err)}`,
        ),
      );
    }, 500);
  }

  async recompute(companyId: string, now = new Date()) {
    const signals = await this.prisma.industrialSignal.findMany({
      where: { companyId },
      select: {
        id: true,
        type: true,
        weight: true,
        confidence: true,
        occurredAt: true,
        dismissedAt: true,
      },
    });
    const result = computeSpaceScore(signals, now);
    const existing = await this.prisma.spaceScore.findUnique({ where: { companyId } });
    await this.prisma.spaceScore.upsert({
      where: { companyId },
      create: {
        companyId,
        score: result.score,
        bandLabel: result.bandLabel,
        topSignalIds: result.topSignalIds,
        computedAt: now,
        previousScore: null,
      },
      update: {
        previousScore: existing?.score ?? null,
        score: result.score,
        bandLabel: result.bandLabel,
        topSignalIds: result.topSignalIds,
        computedAt: now,
      },
    });
    return result;
  }

  async recomputeAll(now = new Date()) {
    const companies = await this.prisma.company.findMany({
      where: { isActive: true },
      select: { id: true },
    });
    let n = 0;
    for (const c of companies) {
      await this.recompute(c.id, now);
      n += 1;
    }
    return n;
  }
}
