import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { SignalType } from '@cre/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SignalService {
  constructor(private readonly prisma: PrismaService) {}

  async upsertSignal(input: {
    parcelId: string;
    type: SignalType | string;
    payload: Record<string, unknown>;
    expiresAt?: Date | null;
  }) {
    const existing = await this.prisma.signal.findFirst({
      where: { parcelId: input.parcelId, type: input.type },
      orderBy: { detectedAt: 'desc' },
    });

    if (existing) {
      return this.prisma.signal.update({
        where: { id: existing.id },
        data: {
          payload: input.payload as Prisma.InputJsonValue,
          detectedAt: new Date(),
          expiresAt: input.expiresAt ?? existing.expiresAt,
        },
      });
    }

    return this.prisma.signal.create({
      data: {
        parcelId: input.parcelId,
        type: input.type,
        payload: input.payload as Prisma.InputJsonValue,
        expiresAt: input.expiresAt ?? null,
      },
    });
  }

  async activeTypesForParcel(parcelId: string): Promise<string[]> {
    const now = new Date();
    const rows = await this.prisma.signal.findMany({
      where: {
        parcelId,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { type: true },
    });
    return [...new Set(rows.map((r) => r.type))];
  }
}
