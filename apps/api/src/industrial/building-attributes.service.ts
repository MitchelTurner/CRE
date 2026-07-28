import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export type BuildingAttributesInput = {
  buildingSf?: number | null;
  clearHeightFt?: number | null;
  dockDoors?: number | null;
  driveInDoors?: number | null;
  sprinklerType?: string | null;
  powerAmps?: number | null;
  powerVolts?: number | null;
  railServed?: boolean | null;
  yardAcres?: number | null;
  trailerStalls?: number | null;
  officeSf?: number | null;
  craneCapacityTon?: number | null;
  yearBuilt?: number | null;
  isListed?: boolean | null;
  sourceNotes?: string | null;
  verifiedBy?: string | null;
  /** When true (default), stamp verifiedAt/verifiedBy. */
  markVerified?: boolean;
};

const SPRINKLER = new Set(['ESFR', 'wet', 'dry', 'none']);

@Injectable()
export class BuildingAttributesService {
  constructor(private readonly prisma: PrismaService) {}

  async getByPin(pin: string) {
    const parcel = await this.prisma.parcel.findUnique({
      where: { pin },
      select: {
        id: true,
        pin: true,
        situsAddress: true,
        propType: true,
        landUseCode: true,
        submarket: true,
        fairMarketVal: true,
        rawAttributes: true,
      },
    });
    if (!parcel) throw new NotFoundException(`Parcel ${pin} not found`);

    const attrs = await this.prisma.buildingAttributes.findUnique({
      where: { parcelId: parcel.id },
    });
    const inferred = inferFromAssessor(parcel.rawAttributes as Record<string, unknown>);

    return {
      parcelId: parcel.id,
      pin: parcel.pin,
      situsAddress: parcel.situsAddress,
      propType: parcel.propType,
      landUseCode: parcel.landUseCode,
      submarket: parcel.submarket,
      fairMarketVal: parcel.fairMarketVal,
      attributes: attrs,
      inferred,
      /** Effective display values: verified attrs win; else inferred (flagged). */
      display: {
        buildingSf: attrs?.buildingSf ?? inferred.buildingSf ?? null,
        buildingSfVerified: attrs?.buildingSf != null && Boolean(attrs.verifiedAt),
        yearBuilt: attrs?.yearBuilt ?? inferred.yearBuilt ?? null,
        yearBuiltVerified: attrs?.yearBuilt != null && Boolean(attrs.verifiedAt),
        clearHeightFt: attrs?.clearHeightFt ?? null,
        clearHeightVerified: attrs?.clearHeightFt != null && Boolean(attrs.verifiedAt),
      },
    };
  }

  async upsertByPin(pin: string, body: BuildingAttributesInput) {
    const parcel = await this.prisma.parcel.findUnique({
      where: { pin },
      select: { id: true },
    });
    if (!parcel) throw new NotFoundException(`Parcel ${pin} not found`);

    const markVerified = body.markVerified !== false;
    const sprinkler =
      body.sprinklerType == null || body.sprinklerType === ''
        ? null
        : SPRINKLER.has(String(body.sprinklerType))
          ? String(body.sprinklerType)
          : String(body.sprinklerType).slice(0, 32);

    const data: Prisma.BuildingAttributesUncheckedCreateInput = {
      parcelId: parcel.id,
      buildingSf: intOrNull(body.buildingSf),
      clearHeightFt: floatOrNull(body.clearHeightFt),
      dockDoors: intOrNull(body.dockDoors),
      driveInDoors: intOrNull(body.driveInDoors),
      sprinklerType: sprinkler,
      powerAmps: intOrNull(body.powerAmps),
      powerVolts: intOrNull(body.powerVolts),
      railServed: body.railServed ?? null,
      yardAcres: floatOrNull(body.yardAcres),
      trailerStalls: intOrNull(body.trailerStalls),
      officeSf: intOrNull(body.officeSf),
      craneCapacityTon: floatOrNull(body.craneCapacityTon),
      yearBuilt: intOrNull(body.yearBuilt),
      isListed: body.isListed ?? false,
      sourceNotes: body.sourceNotes?.trim() || null,
      verifiedAt: markVerified ? new Date() : null,
      verifiedBy: markVerified ? body.verifiedBy?.trim() || 'agent' : null,
    };

    const attrs = await this.prisma.buildingAttributes.upsert({
      where: { parcelId: parcel.id },
      create: data,
      update: {
        buildingSf: data.buildingSf,
        clearHeightFt: data.clearHeightFt,
        dockDoors: data.dockDoors,
        driveInDoors: data.driveInDoors,
        sprinklerType: data.sprinklerType,
        powerAmps: data.powerAmps,
        powerVolts: data.powerVolts,
        railServed: data.railServed,
        yardAcres: data.yardAcres,
        trailerStalls: data.trailerStalls,
        officeSf: data.officeSf,
        craneCapacityTon: data.craneCapacityTon,
        yearBuilt: data.yearBuilt,
        isListed: data.isListed,
        sourceNotes: data.sourceNotes,
        verifiedAt: data.verifiedAt,
        verifiedBy: data.verifiedBy,
      },
    });

    return { parcelId: parcel.id, pin, attributes: attrs };
  }
}

function intOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? Math.round(n) : null;
}

function floatOrNull(v: unknown): number | null {
  if (v == null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Best-effort assessor / ArcGIS field scrape for seed values. */
export function inferFromAssessor(raw: Record<string, unknown> | null | undefined): {
  buildingSf: number | null;
  yearBuilt: number | null;
} {
  if (!raw) return { buildingSf: null, yearBuilt: null };
  const sfKeys = [
    'BLDG_SF',
    'BLDGSF',
    'BuildingSF',
    'SQFT',
    'SqFt',
    'HEATEDSF',
    'HeatedSF',
    'GROSS_SF',
    'GrossSF',
    'AREA',
    'LivingArea',
  ];
  const yearKeys = ['YEARBUILT', 'YearBuilt', 'YR_BUILT', 'YRBUILT', 'YEAR_BUILT'];
  let buildingSf: number | null = null;
  let yearBuilt: number | null = null;
  for (const k of sfKeys) {
    const n = Number(raw[k]);
    if (Number.isFinite(n) && n > 500) {
      buildingSf = Math.round(n);
      break;
    }
  }
  for (const k of yearKeys) {
    const n = Number(raw[k]);
    if (Number.isFinite(n) && n >= 1800 && n <= 2100) {
      yearBuilt = Math.round(n);
      break;
    }
  }
  return { buildingSf, yearBuilt };
}
