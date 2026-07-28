import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { RawRecord, SignalDraft, SignalSource } from './signal-source.interface';

export type AerialObservationBody = {
  observationId?: string;
  siteId?: string | null;
  parcelId?: string | null;
  companyName?: string;
  siteAddress?: string;
  flightDate: string;
  trailerCount?: number | null;
  containerCount?: number | null;
  yardCoveragePct: number;
  priorYardCoveragePct?: number | null;
  priorFlightDate?: string | null;
  imageRef?: string | null;
  annotatedImageRef?: string | null;
  eventKind?: 'overflow' | 'contraction' | 'observation';
};

/**
 * Aerial / yard utilization — Tier 1.
 * Prefer YardObservation rows written via Admin ingest (manual/assisted counts).
 * Optional AERIAL_FEED_URL for pre-diffed JSON events.
 */
@Injectable()
export class AerialConnector implements SignalSource {
  readonly key = 'aerial';
  readonly cadence = '0 16 * * 1';
  readonly tier = 1 as const;
  private readonly logger = new Logger(AerialConnector.name);

  constructor(private readonly prisma: PrismaService) {}

  async fetch(since: Date): Promise<RawRecord[]> {
    const feedUrl = (process.env.AERIAL_FEED_URL || '').trim();
    if (feedUrl) {
      const res = await fetch(feedUrl, {
        headers: {
          Accept: 'application/json',
          'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+aerial-connector; industrial-signals)',
        },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`AERIAL_FEED_URL HTTP ${res.status}`);
      const rows = (await res.json()) as AerialObservationBody[];
      return rows.map((body, i) => ({
        sourceRef: aerialSourceRef(body, i),
        fetchedAt: new Date(),
        body,
      }));
    }

    const observations = await this.prisma.yardObservation.findMany({
      where: { flightDate: { gte: since } },
      orderBy: { flightDate: 'asc' },
      take: 500,
    });

    const out: RawRecord[] = [];
    for (const obs of observations) {
      if (obs.yardCoveragePct == null) continue;
      const prior = await this.prisma.yardObservation.findFirst({
        where: {
          flightDate: { lt: obs.flightDate },
          OR: [
            obs.siteId ? { siteId: obs.siteId } : undefined,
            obs.parcelId ? { parcelId: obs.parcelId } : undefined,
          ].filter(Boolean) as Array<{ siteId?: string; parcelId?: string }>,
        },
        orderBy: { flightDate: 'desc' },
      });

      const body: AerialObservationBody = {
        observationId: obs.id,
        siteId: obs.siteId,
        parcelId: obs.parcelId,
        flightDate: obs.flightDate.toISOString(),
        trailerCount: obs.trailerCount,
        containerCount: obs.containerCount,
        yardCoveragePct: obs.yardCoveragePct,
        priorYardCoveragePct: prior?.yardCoveragePct ?? null,
        priorFlightDate: prior?.flightDate?.toISOString() ?? null,
        imageRef: obs.imageRef,
        annotatedImageRef: obs.annotatedImageRef,
        eventKind: classifyYardEvent(obs.yardCoveragePct, prior?.yardCoveragePct ?? null),
      };

      // Resolve company/address hints from site/parcel for normalize
      if (obs.siteId) {
        const site = await this.prisma.site.findUnique({
          where: { id: obs.siteId },
          include: { company: true },
        });
        if (site) {
          body.companyName = site.company.canonicalName;
          body.siteAddress = site.rawAddress;
        }
      } else if (obs.parcelId) {
        const parcel = await this.prisma.parcel.findUnique({
          where: { id: obs.parcelId },
          include: { owner: true },
        });
        if (parcel) {
          body.companyName = parcel.owner?.nameRaw || parcel.situsAddress || parcel.pin;
          body.siteAddress = parcel.situsAddress || parcel.pin;
        }
      }

      if (body.eventKind === 'observation') continue;

      out.push({
        sourceRef: aerialSourceRef(body, 0),
        fetchedAt: new Date(),
        body,
      });
    }

    this.logger.log(`Aerial fetch produced ${out.length} threshold events from ${observations.length} observations`);
    return out;
  }

  normalize(raw: RawRecord): SignalDraft[] {
    const b = raw.body as AerialObservationBody;
    if (b?.yardCoveragePct == null || !b.flightDate) return [];

    const kind =
      b.eventKind ||
      classifyYardEvent(Number(b.yardCoveragePct), b.priorYardCoveragePct ?? null);
    if (kind === 'observation') return [];

    const companyName = b.companyName?.trim();
    if (!companyName) return [];

    const pct = Number(b.yardCoveragePct);
    const prior = b.priorYardCoveragePct != null ? Number(b.priorYardCoveragePct) : null;
    const occurredAt = new Date(b.flightDate);
    const safeDate = Number.isNaN(occurredAt.getTime()) ? new Date() : occurredAt;

    if (kind === 'overflow') {
      return [
        {
          type: 'YARD_UTILIZATION',
          subtype: 'overflow',
          companyName,
          companyAddress: b.siteAddress || undefined,
          siteAddress: b.siteAddress || undefined,
          occurredAt: safeDate,
          sourceRef: raw.sourceRef,
          headline: `Yard overflow — ${companyName} at ${pct.toFixed(0)}% coverage (2 flights)`,
          weight: 35,
          payload: {
            yardCoveragePct: pct,
            priorYardCoveragePct: prior,
            trailerCount: b.trailerCount ?? null,
            containerCount: b.containerCount ?? null,
            imageRef: b.imageRef ?? null,
            annotatedImageRef: b.annotatedImageRef ?? null,
            observationId: b.observationId ?? null,
            parcelId: b.parcelId ?? null,
            detail: `${pct.toFixed(0)}% yard coverage`,
            channelHint: 'in_person',
          },
        },
      ];
    }

    return [
      {
        type: 'YARD_UTILIZATION',
        subtype: 'contraction',
        companyName,
        companyAddress: b.siteAddress || undefined,
        siteAddress: b.siteAddress || undefined,
        occurredAt: safeDate,
        sourceRef: raw.sourceRef,
        headline: `Yard contraction — ${companyName} ${prior?.toFixed(0) ?? '?'}%→${pct.toFixed(0)}%`,
        weight: 30,
        payload: {
          yardCoveragePct: pct,
          priorYardCoveragePct: prior,
          trailerCount: b.trailerCount ?? null,
          containerCount: b.containerCount ?? null,
          imageRef: b.imageRef ?? null,
          annotatedImageRef: b.annotatedImageRef ?? null,
          observationId: b.observationId ?? null,
          parcelId: b.parcelId ?? null,
          detail: `${prior?.toFixed(0) ?? '?'}%→${pct.toFixed(0)}% coverage`,
        },
      },
    ];
  }
}

/** >85% sustained across two flights → overflow; <20% from prior >60% → contraction. */
export function classifyYardEvent(
  coverage: number,
  prior: number | null,
): 'overflow' | 'contraction' | 'observation' {
  if (prior != null && coverage > 85 && prior > 85) return 'overflow';
  if (prior != null && prior > 60 && coverage < 20) return 'contraction';
  return 'observation';
}

function aerialSourceRef(body: AerialObservationBody, index: number): string {
  const key =
    body.observationId ||
    body.parcelId ||
    body.siteId ||
    body.companyName ||
    `row-${index}`;
  const kind = body.eventKind || 'event';
  const day = (body.flightDate || '').slice(0, 10);
  return `aerial:${kind}:${key}:${day}`.slice(0, 200);
}
