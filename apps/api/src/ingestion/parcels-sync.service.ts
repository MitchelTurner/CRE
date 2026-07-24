import { Injectable, Logger } from '@nestjs/common';
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
}

@Injectable()
export class ParcelsSyncService {
  private readonly logger = new Logger(ParcelsSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly arcgis: ArcGisClient,
    private readonly appConfig: AppConfigService,
    private readonly config: ConfigService,
  ) {}

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

      for await (const attrs of this.arcgis.iterateFeatures({
        where,
        outFields: '*',
        onPage: ({ offset, count }) => {
          this.logger.debug(`Page offset=${offset} count=${count}`);
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
          },
          update: {
            nameRaw: mapped.owner.nameRaw,
            mailingCity: mapped.owner.mailingCity,
            mailingState: mapped.owner.mailingState,
            mailingZip: mapped.owner.mailingZip,
            isEntity: mapped.owner.isEntity,
            isAbsentee: mapped.owner.isAbsentee,
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

      // Only mark missing parcels inactive after a fully successful sync.
      if (seenPins.size > 0) {
        const deactivated = await this.prisma.parcel.updateMany({
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
        this.logger.log(`Marked ${deactivated.count} parcels inactive`);
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

      return { syncRunId: syncRun.id, recordsSeen, recordsUpserted, status: 'success' };
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