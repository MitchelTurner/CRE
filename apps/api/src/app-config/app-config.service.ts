import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CONFIG_KEYS,
  type FieldMap,
  type ScoreWeights,
} from '@cre/shared';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AppConfigService implements OnModuleInit {
  private readonly logger = new Logger(AppConfigService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit(): Promise<void> {
    try {
      await this.seedDefaults();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`AppConfig seed failed (continuing boot): ${message}`);
    }
  }

  async seedDefaults(): Promise<void> {
    const defaults: Record<string, unknown> = {
      [CONFIG_KEYS.COMMERCIAL_LANDUSE_CODES]: this.config.get('defaults.commercialLandUseCodes'),
      [CONFIG_KEYS.COMMERCIAL_PROP_TYPES]: this.config.get('defaults.commercialPropTypes'),
      [CONFIG_KEYS.SCORE_WEIGHTS]: this.config.get('defaults.scoreWeights'),
      [CONFIG_KEYS.LANDUSE_PRIORITY]: this.config.get('defaults.landUsePriority'),
      [CONFIG_KEYS.FIELD_MAP]: this.config.get('defaults.fieldMap'),
    };

    for (const [key, value] of Object.entries(defaults)) {
      await this.prisma.appConfig.upsert({
        where: { key },
        create: { key, value: value as Prisma.InputJsonValue },
        update: {},
      });
    }
    this.logger.log('AppConfig defaults seeded (existing keys left unchanged)');
  }

  async getJson<T>(key: string, fallback: T): Promise<T> {
    const row = await this.prisma.appConfig.findUnique({ where: { key } });
    if (!row) return fallback;
    return row.value as T;
  }

  async getCommercialLandUseCodes(): Promise<string[]> {
    return this.getJson(
      CONFIG_KEYS.COMMERCIAL_LANDUSE_CODES,
      this.config.getOrThrow<string[]>('defaults.commercialLandUseCodes'),
    );
  }

  async getCommercialPropTypes(): Promise<string[]> {
    return this.getJson(
      CONFIG_KEYS.COMMERCIAL_PROP_TYPES,
      this.config.getOrThrow<string[]>('defaults.commercialPropTypes'),
    );
  }

  async getScoreWeights(): Promise<ScoreWeights> {
    return this.getJson(
      CONFIG_KEYS.SCORE_WEIGHTS,
      this.config.getOrThrow<ScoreWeights>('defaults.scoreWeights'),
    );
  }

  async getLandUsePriority(): Promise<Record<string, number>> {
    return this.getJson(
      CONFIG_KEYS.LANDUSE_PRIORITY,
      this.config.getOrThrow<Record<string, number>>('defaults.landUsePriority'),
    );
  }

  async getFieldMap(): Promise<FieldMap> {
    return this.getJson(
      CONFIG_KEYS.FIELD_MAP,
      this.config.getOrThrow<FieldMap>('defaults.fieldMap'),
    );
  }
}