import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

const MIN_SF = 20_000;

/**
 * Primary industrial moat KPI:
 * % of industrial parcels ≥20k SF with verified clear height, by submarket.
 */
@Injectable()
export class CoverageService {
  constructor(private readonly prisma: PrismaService) {}

  async bySubmarket() {
    const industrial = await this.prisma.parcel.findMany({
      where: {
        isActive: true,
        OR: [
          { propType: { contains: 'INDUSTRIAL', mode: 'insensitive' } },
          { landUseDesc: { contains: 'industri', mode: 'insensitive' } },
          { landUseCode: { in: ['340', '341', '342', '343', '344', '350', '351'] } },
        ],
      },
      select: {
        id: true,
        pin: true,
        submarket: true,
        propType: true,
        fairMarketVal: true,
      },
    });

    const attrs = await this.prisma.buildingAttributes.findMany({
      where: { parcelId: { in: industrial.map((p) => p.id) } },
      select: {
        parcelId: true,
        buildingSf: true,
        clearHeightFt: true,
        verifiedAt: true,
      },
    });
    const attrMap = new Map(attrs.map((a) => [a.parcelId, a]));

    type Bucket = {
      submarket: string;
      eligible: number;
      withVerifiedClear: number;
      pct: number;
      missingPins: string[];
    };
    const buckets = new Map<string, Bucket>();

    let eligibleTotal = 0;
    let verifiedTotal = 0;

    for (const p of industrial) {
      const a = attrMap.get(p.id);
      const sf = a?.buildingSf ?? null;
      // Without SF, treat higher-FMV industrial as proxy ≥20k (rough $50/SF → $1M).
      const eligible =
        (sf != null && sf >= MIN_SF) ||
        (sf == null && (p.fairMarketVal ?? 0) >= 1_000_000);
      if (!eligible) continue;

      const sm = p.submarket?.trim() || 'Unassigned';
      let bucket = buckets.get(sm);
      if (!bucket) {
        bucket = {
          submarket: sm,
          eligible: 0,
          withVerifiedClear: 0,
          pct: 0,
          missingPins: [],
        };
        buckets.set(sm, bucket);
      }
      bucket.eligible += 1;
      eligibleTotal += 1;

      const verifiedClear =
        a?.clearHeightFt != null && a.clearHeightFt > 0 && a.verifiedAt != null;
      if (verifiedClear) {
        bucket.withVerifiedClear += 1;
        verifiedTotal += 1;
      } else if (bucket.missingPins.length < 8) {
        bucket.missingPins.push(p.pin);
      }
    }

    const bySubmarket = [...buckets.values()]
      .map((b) => ({
        ...b,
        pct: b.eligible ? Math.round((b.withVerifiedClear / b.eligible) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.eligible - a.eligible || a.submarket.localeCompare(b.submarket));

    return {
      minSf: MIN_SF,
      totalEligible: eligibleTotal,
      totalWithVerifiedClear: verifiedTotal,
      pct:
        eligibleTotal > 0
          ? Math.round((verifiedTotal / eligibleTotal) * 1000) / 10
          : 0,
      bySubmarket,
      note: 'Eligible = industrial parcels with buildingSf ≥20k (or FMV ≥$1M when SF unknown). Verified clear height requires verifiedAt.',
    };
  }
}
