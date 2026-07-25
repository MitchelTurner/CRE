import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { ArcGisClient } from '../arcgis/arcgis.client';
import { mapArcGisAttributes } from '../arcgis/parcel.mapper';
import { AppConfigService } from '../app-config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';

export interface SyncResult {
  syncRunId: string;
  recordsSeen: number;
  recordsUpserted: number;
  status: 'success' | 'failed';
  error?: string;
  deactivated?: number;
  deactivationSkipped?: string;
}

@Injectable()
export class ParcelsSyncService implements OnModuleInit {
  private readonly logger = new Logger(ParcelsSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly arcgis: ArcGisClient,
    private readonly appConfig: AppConfigService,
    private readonly config: ConfigService,
  ) {}

  async onModuleInit() {
    try {
      const healed = await this.reactivateCommercialIfEmpty();
      if (healed.reactivated > 0) {
        this.logger.warn(
          `Auto-healed inventory: reactivated ${healed.reactivated} commercial parcels (active was empty)`,
        );
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Inventory auto-heal skipped: ${message}`);
    }
  }

  /**
   * Recovery: if every commercial parcel was soft-deactivated (partial sync bug),
   * bring them back. Safe no-op when active inventory already exists.
   */
  async reactivateCommercialIfEmpty(): Promise<{
    reactivated: number;
    activeCommercial: number;
    inactiveCommercial: number;
  }> {
    const [activeCommercial, inactiveCommercial] = await Promise.all([
      this.prisma.parcel.count({
        where: { isActive: true, isCommercial: true },
      }),
      this.prisma.parcel.count({
        where: { isActive: false, isCommercial: true },
      }),
    ]);

    if (activeCommercial > 0 || inactiveCommercial === 0) {
      return { reactivated: 0, activeCommercial, inactiveCommercial };
    }

    const result = await this.prisma.parcel.updateMany({
      where: { isActive: false, isCommercial: true },
      data: { isActive: true },
    });
    return {
      reactivated: result.count,
      activeCommercial: result.count,
      inactiveCommercial: 0,
    };
  }

  /** Manual recovery — reactivate all commercial parcels. */
  async reactivateAllCommercial(): Promise<{ reactivated: number }> {
    const result = await this.prisma.parcel.updateMany({
      where: { isActive: false, isCommercial: true },
      data: { isActive: true },
    });
    this.logger.warn(`Manually reactivated ${result.count} commercial parcels`);
    return { reactivated: result.count };
  }

  async inventoryCounts() {
    const [total, active, activeCommercial, inactiveCommercial] = await Promise.all([
      this.prisma.parcel.count(),
      this.prisma.parcel.count({ where: { isActive: true } }),
      this.prisma.parcel.count({ where: { isActive: true, isCommercial: true } }),
      this.prisma.parcel.count({ where: { isActive: false, isCommercial: true } }),
    ]);
    return { total, active, activeCommercial, inactiveCommercial };
  }

  async runFullSync(source = 'arcgis_parcels'): Promise<SyncResult> {
    const syncRun = await this.prisma.syncRun.create({
      data: { source, status: 'running' },
    });

    let recordsSeen = 0;
    let recordsUpserted = 0;
    const seenPins = new Set<string>();

    try {
      const [fieldMap, commercialCodes, commercialPropTypes] = await Promise.all([
        this.appConfig.getFieldMap(),
        this.appConfig.getCommercialLandUseCodes(),
        this.appConfig.getCommercialPropTypes(),
      ]);
      const commercialLandUseSet = new Set(commercialCodes);
      const commercialPropTypeSet = new Set(commercialPropTypes);
      const homeState = this.config.get<string>('countyHomeState') ?? 'SC';

      // Prefer commercial-only filter when PROPTYPE is available — far fewer records.
      // Fallback where covers both PROPTYPE and LANDUSE for safety.
      const propTypeClause = commercialPropTypes
        .map((p) => `'${p.replace(/'/g, "''")}'`)
        .join(',');
      const landUseClause = commercialCodes
        .map((c) => `'${c.replace(/'/g, "''")}'`)
        .join(',');
      const where =
        commercialPropTypes.length > 0
          ? `PROPTYPE IN (${propTypeClause}) OR LANDUSE IN (${landUseClause})`
          : `LANDUSE IN (${landUseClause})`;

      this.logger.log(`Starting parcel sync where=${where}`);

      let expectedCount: number | null = null;
      try {
        expectedCount = await this.arcgis.countFeatures(where);
        this.logger.log(`ArcGIS expected count=${expectedCount}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`Could not read ArcGIS count — deactivation will be skipped: ${message}`);
      }

      for await (const attrs of this.arcgis.iterateFeatures({
        where,
        outFields: '*',
        onPage: ({ offset, count, exceededTransferLimit }) => {
          this.logger.debug(
            `Page offset=${offset} count=${count} exceededTransferLimit=${exceededTransferLimit ?? false}`,
          );
        },
      })) {
        recordsSeen += 1;
        const mapped = mapArcGisAttributes(attrs, fieldMap, {
          commercialLandUseCodes: commercialLandUseSet,
          commercialPropTypes: commercialPropTypeSet,
          homeState,
        });
        if (!mapped) continue;

        seenPins.add(mapped.pin);

        const owner = await this.prisma.owner.upsert({
          where: {
            nameNormalized_mailingAddress: {
              nameNormalized: mapped.owner.nameNormalized,
              mailingAddress: mapped.owner.mailingAddress ?? '',
            },
          },
          create: {
            nameRaw: mapped.owner.nameRaw,
            nameNormalized: mapped.owner.nameNormalized,
            mailingAddress: mapped.owner.mailingAddress ?? '',
            mailingCity: mapped.owner.mailingCity,
            mailingState: mapped.owner.mailingState,
            mailingZip: mapped.owner.mailingZip,
            isEntity: mapped.owner.isEntity,
            isAbsentee: mapped.owner.isAbsentee,
            clusterKey: mapped.owner.clusterKey,
          },
          update: {
            nameRaw: mapped.owner.nameRaw,
            mailingCity: mapped.owner.mailingCity,
            mailingState: mapped.owner.mailingState,
            mailingZip: mapped.owner.mailingZip,
            isEntity: mapped.owner.isEntity,
            isAbsentee: mapped.owner.isAbsentee,
            clusterKey: mapped.owner.clusterKey,
          },
        });

        await this.prisma.parcel.upsert({
          where: { pin: mapped.pin },
          create: {
            pin: mapped.pin,
            situsAddress: mapped.situsAddress,
            landUseCode: mapped.landUseCode,
            landUseDesc: mapped.propType,
            propType: mapped.propType,
            subdivision: mapped.subdivision,
            deedDate: mapped.deedDate,
            fairMarketVal: mapped.fairMarketVal,
            salePrice: mapped.salePrice,
            totalTax: mapped.totalTax,
            paidDate: mapped.paidDate,
            latitude: mapped.latitude,
            longitude: mapped.longitude,
            rawAttributes: mapped.rawAttributes as Prisma.InputJsonValue,
            isCommercial: mapped.isCommercial,
            isActive: true,
            ownerId: owner.id,
          },
          update: {
            situsAddress: mapped.situsAddress,
            landUseCode: mapped.landUseCode,
            landUseDesc: mapped.propType,
            propType: mapped.propType,
            subdivision: mapped.subdivision,
            deedDate: mapped.deedDate,
            fairMarketVal: mapped.fairMarketVal,
            salePrice: mapped.salePrice,
            totalTax: mapped.totalTax,
            paidDate: mapped.paidDate,
            latitude: mapped.latitude,
            longitude: mapped.longitude,
            rawAttributes: mapped.rawAttributes as Prisma.InputJsonValue,
            isCommercial: mapped.isCommercial,
            isActive: true,
            ownerId: owner.id,
          },
        });
        recordsUpserted += 1;

        if (recordsUpserted % 500 === 0) {
          await this.prisma.syncRun.update({
            where: { id: syncRun.id },
            data: { recordsSeen, recordsUpserted },
          });
          this.logger.log(`Progress: seen=${recordsSeen} upserted=${recordsUpserted}`);
        }
      }

      const lastSuccess = await this.prisma.syncRun.findFirst({
        where: {
          status: 'success',
          source,
          id: { not: syncRun.id },
        },
        orderBy: { finishedAt: 'desc' },
      });
      const previousUpserted = lastSuccess?.recordsUpserted ?? 0;

      const completenessOk =
        expectedCount != null && recordsSeen >= Math.floor(expectedCount * 0.95);
      const dropOk =
        previousUpserted === 0 ||
        recordsUpserted >= Math.floor(previousUpserted * 0.7);

      let deactivated = 0;
      let deactivationSkipped: string | undefined;

      if (seenPins.size === 0) {
        deactivationSkipped = 'no pins seen';
      } else if (!completenessOk) {
        deactivationSkipped =
          expectedCount == null
            ? 'missing ArcGIS expected count'
            : `incomplete pull (seen=${recordsSeen} expected=${expectedCount})`;
        this.logger.warn(`Skipping deactivation: ${deactivationSkipped}`);
      } else if (!dropOk) {
        deactivationSkipped = `catastrophic drop vs last success (upserted=${recordsUpserted} previous=${previousUpserted})`;
        this.logger.warn(`Skipping deactivation: ${deactivationSkipped}`);
      } else {
        const result = await this.prisma.parcel.updateMany({
          where: {
            isActive: true,
            pin: { notIn: [...seenPins] },
            OR: [
              { propType: { in: commercialPropTypes } },
              { landUseCode: { in: commercialCodes } },
            ],
          },
          data: { isActive: false },
        });
        deactivated = result.count;
        this.logger.log(`Marked ${deactivated} parcels inactive`);
      }

      await this.prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: 'success',
          finishedAt: new Date(),
          recordsSeen,
          recordsUpserted,
        },
      });

      return {
        syncRunId: syncRun.id,
        recordsSeen,
        recordsUpserted,
        status: 'success',
        deactivated,
        deactivationSkipped,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Sync failed: ${message}`);
      await this.prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          recordsSeen,
          recordsUpserted,
          error: message,
        },
      });
      return {
        syncRunId: syncRun.id,
        recordsSeen,
        recordsUpserted,
        status: 'failed',
        error: message,
      };
    }
  }
}
