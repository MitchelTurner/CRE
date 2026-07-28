import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { classifyYardEvent } from './connectors/aerial.connector';
import { SignalPipelineService } from './signal-pipeline.service';

export type YardObservationInput = {
  pin?: string;
  siteId?: string;
  parcelId?: string;
  companyName?: string;
  siteAddress?: string;
  flightDate: string;
  trailerCount?: number | null;
  containerCount?: number | null;
  yardCoveragePct: number;
  yardAcres?: number | null;
  imageRef?: string | null;
};

@Injectable()
export class YardObservationService {
  private readonly logger = new Logger(YardObservationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pipeline: SignalPipelineService,
  ) {}

  list(limit = 50) {
    return this.prisma.yardObservation.findMany({
      orderBy: { flightDate: 'desc' },
      take: Math.min(limit, 200),
    });
  }

  async create(input: YardObservationInput) {
    let parcelId = input.parcelId ?? null;
    let siteId = input.siteId ?? null;
    let companyName = input.companyName;
    let siteAddress = input.siteAddress;

    if (input.pin && !parcelId) {
      const parcel = await this.prisma.parcel.findUnique({
        where: { pin: input.pin },
        include: { owner: true },
      });
      if (!parcel) throw new NotFoundException(`Parcel ${input.pin} not found`);
      parcelId = parcel.id;
      companyName = companyName || parcel.owner?.nameRaw || parcel.situsAddress || parcel.pin;
      siteAddress = siteAddress || parcel.situsAddress || parcel.pin;
    }

    const flightDate = new Date(input.flightDate);
    if (Number.isNaN(flightDate.getTime())) {
      throw new BadRequestException('Invalid flightDate');
    }

    const coverage = Number(input.yardCoveragePct);
    const annotatedImageRef = renderYardAnnotationSvg({
      companyName: companyName || siteAddress || parcelId || 'Site',
      flightDate: flightDate.toISOString().slice(0, 10),
      yardCoveragePct: coverage,
      trailerCount: input.trailerCount ?? null,
      containerCount: input.containerCount ?? null,
    });

    const observation = await this.prisma.yardObservation.create({
      data: {
        siteId,
        parcelId,
        flightDate,
        trailerCount: input.trailerCount ?? null,
        containerCount: input.containerCount ?? null,
        yardCoveragePct: coverage,
        imageRef: input.imageRef ?? null,
        annotatedImageRef,
      },
    });

    // Auto-populate BuildingAttributes yard metrics when parcel known.
    if (parcelId) {
      await this.prisma.buildingAttributes.upsert({
        where: { parcelId },
        create: {
          parcelId,
          yardAcres: input.yardAcres ?? null,
          trailerStalls: input.trailerCount ?? null,
          sourceNotes: `Aerial ${flightDate.toISOString().slice(0, 10)}: ${coverage}% coverage`,
        },
        update: {
          yardAcres: input.yardAcres ?? undefined,
          trailerStalls: input.trailerCount ?? undefined,
          sourceNotes: undefined,
        },
      });
      // Append note without wiping verified fields
      const existing = await this.prisma.buildingAttributes.findUnique({
        where: { parcelId },
        select: { sourceNotes: true },
      });
      const note = `Aerial ${flightDate.toISOString().slice(0, 10)}: ${coverage}% coverage`;
      if (existing && !existing.sourceNotes?.includes(note)) {
        await this.prisma.buildingAttributes.update({
          where: { parcelId },
          data: {
            sourceNotes: existing.sourceNotes
              ? `${existing.sourceNotes}\n${note}`.slice(0, 4000)
              : note,
            ...(input.yardAcres != null ? { yardAcres: input.yardAcres } : {}),
            ...(input.trailerCount != null ? { trailerStalls: input.trailerCount } : {}),
          },
        });
      }
    }

    const prior = await this.prisma.yardObservation.findFirst({
      where: {
        id: { not: observation.id },
        flightDate: { lt: flightDate },
        OR: [
          siteId ? { siteId } : undefined,
          parcelId ? { parcelId } : undefined,
        ].filter(Boolean) as Array<{ siteId?: string; parcelId?: string }>,
      },
      orderBy: { flightDate: 'desc' },
    });

    const eventKind = classifyYardEvent(coverage, prior?.yardCoveragePct ?? null);
    let signalUpserted = 0;
    if (eventKind !== 'observation' && companyName) {
      const result = await this.pipeline.ingestRawRecords('aerial', [
        {
          sourceRef: `aerial:${eventKind}:${observation.id}:${flightDate.toISOString().slice(0, 10)}`,
          body: {
            observationId: observation.id,
            siteId,
            parcelId,
            companyName,
            siteAddress,
            flightDate: flightDate.toISOString(),
            trailerCount: input.trailerCount ?? null,
            containerCount: input.containerCount ?? null,
            yardCoveragePct: coverage,
            priorYardCoveragePct: prior?.yardCoveragePct ?? null,
            priorFlightDate: prior?.flightDate?.toISOString() ?? null,
            imageRef: observation.imageRef,
            annotatedImageRef,
            eventKind,
          },
        },
      ]);
      signalUpserted = result.upserted;
    }

    this.logger.log(
      `YardObservation ${observation.id} coverage=${coverage}% event=${eventKind} signals=${signalUpserted}`,
    );

    return {
      observation,
      eventKind,
      signalUpserted,
      annotatedImageRef,
      note:
        eventKind === 'observation'
          ? 'Observation stored (no threshold signal yet — need two high flights for overflow, or drop from >60% to <20% for contraction)'
          : `Emitted YARD_UTILIZATION ${eventKind}`,
    };
  }
}

/** Lightweight annotated yard card (SVG) — printable for in-person touch. */
export function renderYardAnnotationSvg(input: {
  companyName: string;
  flightDate: string;
  yardCoveragePct: number;
  trailerCount: number | null;
  containerCount: number | null;
}): string {
  const pct = Math.max(0, Math.min(100, input.yardCoveragePct));
  const fillW = Math.round((pct / 100) * 320);
  const tone = pct > 85 ? '#b45309' : pct < 20 ? '#0f766e' : '#334155';
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="480" height="280" viewBox="0 0 480 280">
  <rect width="480" height="280" fill="#0b1220"/>
  <text x="24" y="36" fill="#ecfdf5" font-family="Georgia, serif" font-size="18" font-weight="700">${esc(input.companyName.slice(0, 42))}</text>
  <text x="24" y="58" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="12">Aerial yard review · ${esc(input.flightDate)}</text>
  <rect x="24" y="84" width="432" height="120" rx="8" fill="#111827" stroke="#334155"/>
  <rect x="40" y="120" width="320" height="28" rx="4" fill="#1e293b"/>
  <rect x="40" y="120" width="${fillW}" height="28" rx="4" fill="${tone}"/>
  <text x="370" y="140" fill="#e2e8f0" font-family="system-ui,sans-serif" font-size="14" font-weight="700">${pct.toFixed(0)}%</text>
  <text x="40" y="104" fill="#94a3b8" font-family="system-ui,sans-serif" font-size="11">Yard coverage</text>
  <text x="40" y="180" fill="#cbd5e1" font-family="system-ui,sans-serif" font-size="12">Trailers: ${input.trailerCount ?? '—'} · Containers: ${input.containerCount ?? '—'}</text>
  <text x="24" y="240" fill="#64748b" font-family="system-ui,sans-serif" font-size="11">Greenville CRE · in-person deliverable — do not email this attachment</text>
  <text x="24" y="258" fill="#64748b" font-family="system-ui,sans-serif" font-size="10">I-85 / Greer / Duncan / Piedmont / Donaldson corridor</text>
</svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}
