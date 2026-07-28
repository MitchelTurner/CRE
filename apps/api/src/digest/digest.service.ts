import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_DIGEST_FMV_FLOOR,
  HOT_SIGNAL_TYPES,
  type ScoreComponents,
} from '@cre/shared';
import { AppConfigService } from '../app-config/app-config.service';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { EmailService } from './email.service';
import {
  renderDigestHtml,
  type DigestLeadRow,
  type DigestMoverRow,
} from './digest.template';

export interface DigestPreviewResult {
  subject: string;
  html: string;
  leads: DigestLeadRow[];
  hotLeads: DigestLeadRow[];
  evergreenLeads: DigestLeadRow[];
  movers: DigestMoverRow[];
}

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly appConfig: AppConfigService,
    private readonly scoring: ScoringService,
    private readonly email: EmailService,
  ) {}

  async selectTopLeads(limit: number): Promise<
    Array<{
      parcelId: string;
      pin: string;
      situsAddress: string | null;
      landUseCode: string | null;
      propType: string | null;
      deedDate: Date | null;
      fairMarketVal: number | null;
      score: number;
      components: ScoreComponents;
      ownerName: string;
      isEntity: boolean;
      isAbsentee: boolean;
      mailingState: string | null;
      sosStatus: string | null;
      ownerParcelCount: number;
      signalTypes: string[];
      contactHint: string | null;
    }>
  > {
    const exclusionDays = this.config.get<number>('digestExclusionDays') ?? 90;
    const resendDelta = this.config.get<number>('digestResendScoreDelta') ?? 15;
    const fmvFloor =
      (await this.appConfig.getDigestFmvFloor()) ||
      this.config.get<number>('digestFmvFloor') ||
      DEFAULT_DIGEST_FMV_FLOOR;
    const cutoff = new Date(Date.now() - exclusionDays * 24 * 60 * 60 * 1000);
    const now = new Date();

    const latestScores = await this.prisma.$queryRaw<
      Array<{
        parcelId: string;
        pin: string;
        situsAddress: string | null;
        landUseCode: string | null;
        propType: string | null;
        deedDate: Date | null;
        fairMarketVal: number | null;
        total: number;
        components: ScoreComponents;
        ownerName: string | null;
        isEntity: boolean | null;
        isAbsentee: boolean | null;
        mailingState: string | null;
        sosStatus: string | null;
        ownerId: string | null;
      }>
    >`
      SELECT DISTINCT ON (p.id)
        p.id AS "parcelId",
        p.pin,
        p."situsAddress",
        p."landUseCode",
        p."propType",
        p."deedDate",
        p."fairMarketVal",
        s.total,
        s.components,
        o."nameRaw" AS "ownerName",
        o."isEntity",
        o."isAbsentee",
        o."mailingState",
        o."sosStatus",
        p."ownerId"
      FROM "Parcel" p
      INNER JOIN "Score" s ON s."parcelId" = p.id
      LEFT JOIN "Owner" o ON o.id = p."ownerId"
      WHERE p."isActive" = true
        AND p."isCommercial" = true
        AND (p."fairMarketVal" IS NULL OR p."fairMarketVal" >= ${fmvFloor})
      ORDER BY p.id, s."scoredAt" DESC
    `;

    latestScores.sort((a, b) => b.total - a.total);

    const recentLeads = await this.prisma.lead.findMany({
      where: {
        createdAt: { gte: cutoff },
        digestId: { not: null },
      },
      select: { parcelId: true, createdAt: true },
    });
    const recentlySent = new Set(recentLeads.map((l) => l.parcelId));

    const ownerIds = latestScores.map((r) => r.ownerId).filter((id): id is string => Boolean(id));
    const ownerCounts = await this.prisma.parcel.groupBy({
      by: ['ownerId'],
      where: { isActive: true, isCommercial: true, ownerId: { in: ownerIds } },
      _count: { _all: true },
    });
    const countByOwner = new Map(ownerCounts.map((r) => [r.ownerId!, r._count._all]));

    const selected: Array<(typeof latestScores)[number] & { ownerParcelCount: number }> = [];

    for (const row of latestScores) {
      if (selected.length >= limit) break;

      if (recentlySent.has(row.parcelId)) {
        const prior = await this.prisma.score.findMany({
          where: { parcelId: row.parcelId },
          orderBy: { scoredAt: 'desc' },
          take: 2,
        });
        const previousTotal = prior[1]?.total;
        if (previousTotal === undefined || row.total - previousTotal < resendDelta) {
          continue;
        }
      }

      selected.push({
        ...row,
        ownerParcelCount: row.ownerId ? (countByOwner.get(row.ownerId) ?? 1) : 1,
      });
    }

    const parcelIds = selected.map((r) => r.parcelId);
    const signals = await this.prisma.signal.findMany({
      where: {
        parcelId: { in: parcelIds },
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
      select: { parcelId: true, type: true },
    });
    const signalsByParcel = new Map<string, string[]>();
    for (const s of signals) {
      const list = signalsByParcel.get(s.parcelId) ?? [];
      list.push(s.type);
      signalsByParcel.set(s.parcelId, list);
    }

    const contacts = await this.prisma.contact.findMany({
      where: { ownerId: { in: ownerIds } },
      orderBy: { createdAt: 'desc' },
    });
    const contactByOwner = new Map<string, string>();
    for (const c of contacts) {
      if (contactByOwner.has(c.ownerId)) continue;
      const bits = [c.name, c.phone, c.email].filter(Boolean);
      if (bits.length) contactByOwner.set(c.ownerId, bits.join(' / '));
    }

    return selected.map((r) => ({
      parcelId: r.parcelId,
      pin: r.pin,
      situsAddress: r.situsAddress,
      landUseCode: r.landUseCode,
      propType: r.propType,
      deedDate: r.deedDate,
      fairMarketVal: r.fairMarketVal,
      score: r.total,
      components: r.components,
      ownerName: r.ownerName ?? 'UNKNOWN',
      isEntity: r.isEntity ?? false,
      isAbsentee: r.isAbsentee ?? false,
      mailingState: r.mailingState,
      sosStatus: r.sosStatus,
      ownerParcelCount: r.ownerParcelCount,
      signalTypes: [...new Set(signalsByParcel.get(r.parcelId) ?? [])],
      contactHint: r.ownerId ? (contactByOwner.get(r.ownerId) ?? null) : null,
    }));
  }

  async preview(
    send = false,
    options?: { excludePins?: string[] },
  ): Promise<DigestPreviewResult & { digestId?: string }> {
    const topN = this.config.get<number>('digestTopN') ?? 10;
    const homeState = this.config.get<string>('countyHomeState') ?? 'SC';
    const linkBase =
      this.config.get<string>('countyParcelLinkBase') ??
      'https://www.greenvillecounty.org/appsas400/RealProperty/';
    const exclude = new Set((options?.excludePins ?? []).map((p) => p.trim()).filter(Boolean));
    let candidates = await this.selectTopLeads(Math.max(topN * 2, topN));
    if (exclude.size) {
      candidates = candidates.filter((c) => !exclude.has(c.pin));
    }
    candidates = candidates.slice(0, topN);

    const weekOf = formatWeekOf(new Date());
    const hotSet = new Set<string>(HOT_SIGNAL_TYPES);
    const leads: DigestLeadRow[] = candidates.map((c, i) => {
      const whyNow = this.scoring.buildWhyNow({
        deedDate: c.deedDate,
        ownerName: c.ownerName,
        isEntity: c.isEntity,
        isAbsentee: c.isAbsentee,
        mailingState: c.mailingState,
        homeState,
        activeCommercialParcelCount: c.ownerParcelCount,
        landUseCode: c.landUseCode,
        propType: c.propType,
        components: c.components,
        signalTypes: c.signalTypes,
        sosStatus: c.sosStatus,
        contactHint: c.contactHint,
      });
      const hot = c.signalTypes.some((t) => hotSet.has(t));

      return {
        rank: i + 1,
        pin: c.pin,
        situsAddress: c.situsAddress ?? '(no situs address)',
        landUse: c.propType ?? c.landUseCode ?? 'Unknown',
        score: c.score,
        whyNow,
        ownerName: c.ownerName,
        parcelLink: linkBase,
        hot,
      };
    });

    const estateLeads = leads
      .filter((l) => l.whyNow.toLowerCase().includes('probate') || l.whyNow.toLowerCase().includes('estate'))
      .map((l, i) => ({ ...l, rank: i + 1 }));
    const hotLeads = leads
      .filter((l) => l.hot && !estateLeads.some((e) => e.pin === l.pin))
      .map((l, i) => ({ ...l, rank: i + 1 }));
    const evergreenLeads = leads
      .filter((l) => !l.hot && !estateLeads.some((e) => e.pin === l.pin))
      .map((l, i) => ({ ...l, rank: i + 1 }));

    const now = new Date();
    const inTwoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    const upcomingEvents = await this.prisma.event.findMany({
      where: {
        startsAt: { gte: now, lte: inTwoWeeks },
        status: { in: ['new', 'approved'] },
        ownerDensity: { in: ['high', 'medium'] },
      },
      orderBy: { startsAt: 'asc' },
      take: 12,
    });
    const densityRank = (d: string | null) => (d === 'high' ? 0 : 1);
    upcomingEvents.sort(
      (a, b) =>
        densityRank(a.ownerDensity) - densityRank(b.ownerDensity) ||
        a.startsAt.getTime() - b.startsAt.getTime(),
    );

    const movers = await this.selectMovers(20);

    const countyName = this.config.get<string>('countyName') ?? 'Greenville';
    const subject = `${countyName} CRE Leads — Week of ${weekOf} (${leads.length} new, ${hotLeads.length} hot, ${movers.length} movers)`;
    const html = renderDigestHtml({
      weekOf,
      countyName,
      hotLeads,
      evergreenLeads,
      estateLeads,
      movers,
      events: upcomingEvents.map((e) => ({
        name: e.name,
        whenLabel: e.startsAt.toLocaleString('en-US', { timeZone: 'America/New_York' }),
        venue: e.venue,
        ownerDensity: e.ownerDensity,
        url: e.url,
      })),
    });

    if (!send) {
      return { subject, html, leads, hotLeads, evergreenLeads, movers };
    }

    const digest = await this.prisma.digest.create({
      data: { leadCount: leads.length, htmlBody: html },
    });

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i]!;
      const leadRow = leads[i]!;
      await this.prisma.lead.create({
        data: {
          parcelId: c.parcelId,
          status: 'sent',
          leadType: 'seller',
          digestId: digest.id,
          whyNow: leadRow.whyNow,
        },
      });
    }

    const recipients = this.config.get<string[]>('digestRecipients') ?? [];
    await this.email.send({ to: recipients, subject, html });

    await this.prisma.digest.update({
      where: { id: digest.id },
      data: { sentAt: new Date() },
    });

    this.logger.log(`Digest ${digest.id} sent with ${leads.length} leads + ${movers.length} movers`);
    return { subject, html, leads, hotLeads, evergreenLeads, movers, digestId: digest.id };
  }

  async sendWeekly(options?: {
    excludePins?: string[];
  }): Promise<{ digestId: string; leadCount: number }> {
    const result = await this.preview(true, options);
    return { digestId: result.digestId!, leadCount: result.leads.length };
  }

  /** Companies whose SpaceScore rose ≥20 since last compute. */
  async selectMovers(limit = 20): Promise<DigestMoverRow[]> {
    const rows = await this.prisma.spaceScore.findMany({
      where: {
        score: { gte: 15 },
      },
      include: {
        company: {
          include: {
            signals: { orderBy: { occurredAt: 'desc' }, take: 1 },
            sites: { orderBy: { lastSeenAt: 'desc' }, take: 1 },
          },
        },
      },
      orderBy: { score: 'desc' },
      take: 80,
    });

    const playbooks = await this.prisma.signalPlaybook.findMany();
    const pbKey = (type: string, subtype: string | null) => `${type}::${subtype ?? ''}`;
    const pbMap = new Map(playbooks.map((p) => [pbKey(p.type, p.subtype), p]));

    const movers: DigestMoverRow[] = [];
    for (const row of rows) {
      const prev = row.previousScore ?? 0;
      const delta = row.score - prev;
      // First-seen hot scores (previous null→0) also surface as movers.
      if (delta < 20) continue;
      const signal = row.company.signals[0];
      const site = row.company.sites[0];
      let propertyLabel = 'unresolved — company only';
      if (site?.parcelId) {
        const parcel = await this.prisma.parcel.findUnique({
          where: { id: site.parcelId },
          select: { situsAddress: true, pin: true },
        });
        if (parcel) {
          propertyLabel = parcel.situsAddress || parcel.pin;
        }
      } else if (site?.rawAddress) {
        propertyLabel = site.rawAddress;
      }

      const pb =
        (signal && pbMap.get(pbKey(signal.type, signal.subtype))) ||
        (signal && pbMap.get(pbKey(signal.type, ''))) ||
        null;
      const detail =
        signal && typeof signal.payload === 'object' && signal.payload && 'detail' in signal.payload
          ? String((signal.payload as { detail?: unknown }).detail ?? '')
          : signal?.headline ?? '';
      const talkTrack = pb
        ? pb.talkTrack
            .replace(/\{\{company\}\}/g, row.company.canonicalName)
            .replace(/\{\{detail\}\}/g, detail)
        : null;

      movers.push({
        companyName: row.company.canonicalName,
        score: row.score,
        previousScore: prev,
        delta,
        bandLabel: row.bandLabel,
        propertyLabel,
        signalHeadline: signal?.headline ?? 'SpaceScore movement',
        talkTrack,
      });
      if (movers.length >= limit) break;
    }
    return movers;
  }
}

function formatWeekOf(date: Date): string {
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    timeZone: 'America/New_York',
  });
}
