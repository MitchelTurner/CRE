import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ProgressService } from '../progress/progress.service';
import { SignalService } from '../enrichment/signal.service';

const TAGS = new Set(['vacancy', 'for_lease', 'deferred_maint', 'other']);

@Injectable()
export class DrivebyService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly progress: ProgressService,
    private readonly signals: SignalService,
  ) {}

  async list(limit = 50) {
    const items = await this.prisma.fieldCapture.findMany({
      orderBy: { createdAt: 'desc' },
      take: Math.min(limit, 100),
      include: {
        parcel: {
          select: {
            id: true,
            pin: true,
            situsAddress: true,
            scores: { orderBy: { scoredAt: 'desc' }, take: 1, select: { total: true } },
          },
        },
      },
    });
    return {
      items: items.map((c) => ({
        ...c,
        hasImage: Boolean(c.imageBase64),
        imageBase64: undefined,
        parcel: c.parcel
          ? {
              id: c.parcel.id,
              pin: c.parcel.pin,
              situsAddress: c.parcel.situsAddress,
              score: c.parcel.scores[0]?.total ?? null,
            }
          : null,
      })),
    };
  }

  async create(input: {
    latitude: number;
    longitude: number;
    note?: string;
    tags?: string[];
    imageBase64?: string;
    mediaType?: string;
    pin?: string;
  }) {
    const lat = Number(input.latitude);
    const lon = Number(input.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      throw new BadRequestException('latitude and longitude required');
    }
    if (lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      throw new BadRequestException('invalid coordinates');
    }

    const tags = (input.tags ?? []).filter((t) => TAGS.has(t));
    let imageBase64: string | null = null;
    let imageMime: string | null = null;
    if (input.imageBase64?.trim()) {
      const raw = input.imageBase64.replace(/^data:[^;]+;base64,/, '').trim();
      if (raw.length > 1_100_000) {
        throw new BadRequestException('photo too large — capture a smaller JPEG');
      }
      imageBase64 = raw;
      imageMime = input.mediaType?.startsWith('image/') ? input.mediaType : 'image/jpeg';
    }

    let parcelId: string | null = null;
    let distanceM: number | null = null;
    let pin: string | null = input.pin?.trim() || null;

    if (pin) {
      const parcel = await this.prisma.parcel.findUnique({ where: { pin } });
      if (parcel) {
        parcelId = parcel.id;
        if (parcel.latitude != null && parcel.longitude != null) {
          distanceM = haversineMeters(lat, lon, parcel.latitude, parcel.longitude);
        }
      }
    } else {
      const nearest = await this.findNearestParcel(lat, lon, 250);
      if (nearest) {
        parcelId = nearest.id;
        pin = nearest.pin;
        distanceM = nearest.distanceM;
      }
    }

    const capture = await this.prisma.fieldCapture.create({
      data: {
        parcelId,
        latitude: lat,
        longitude: lon,
        note: input.note?.trim() || null,
        tags,
        imageMime,
        imageBase64,
        distanceM,
      },
    });

    if (parcelId) {
      await this.signals.upsertSignal({
        parcelId,
        type: 'drive_by',
        payload: {
          captureId: capture.id,
          tags,
          note: input.note?.trim() || null,
          distanceM,
          hasPhoto: Boolean(imageBase64),
          capturedAt: capture.createdAt.toISOString(),
        },
        expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      });

      if (input.note?.trim()) {
        await this.prisma.note.create({
          data: {
            kind: 'property',
            title: 'Drive-by',
            body: input.note.trim(),
            parcelId,
          },
        });
      }
    }

    const award = await this.progress.award({
      action: 'drive_by',
      entityType: 'field_capture',
      entityId: capture.id,
      meta: { pin, tags },
    });

    return {
      id: capture.id,
      pin,
      parcelId,
      distanceM,
      tags,
      hasImage: Boolean(imageBase64),
      note: capture.note,
      createdAt: capture.createdAt,
      award,
    };
  }

  async findNearestParcel(lat: number, lon: number, maxMeters = 250) {
    // Rough bbox (~0.01 deg ≈ 1km) then haversine filter.
    const d = 0.01;
    const candidates = await this.prisma.parcel.findMany({
      where: {
        isActive: true,
        isCommercial: true,
        latitude: { gte: lat - d, lte: lat + d },
        longitude: { gte: lon - d, lte: lon + d },
      },
      select: { id: true, pin: true, situsAddress: true, latitude: true, longitude: true },
      take: 80,
    });

    let best: { id: string; pin: string; situsAddress: string | null; distanceM: number } | null =
      null;
    for (const c of candidates) {
      if (c.latitude == null || c.longitude == null) continue;
      const m = haversineMeters(lat, lon, c.latitude, c.longitude);
      if (m > maxMeters) continue;
      if (!best || m < best.distanceM) {
        best = { id: c.id, pin: c.pin, situsAddress: c.situsAddress, distanceM: m };
      }
    }
    return best;
  }
}

function haversineMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}
