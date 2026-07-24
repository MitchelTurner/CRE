import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ScoreComponents } from '@cre/shared';
import { PrismaService } from '../prisma/prisma.service';
import { ScoringService } from '../scoring/scoring.service';
import { EmailService } from './email.service';
import { renderDigestHtml, type DigestLeadRow } from './digest.template';

export interface DigestPreviewResult {
  subject: string;
  html: string;
  leads: DigestLeadRow[];
}

@Injectable()
export class DigestService {
  private readonly logger = new Logger(DigestService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
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
      score: number;
      components: ScoreComponents;
      ownerName: string;
      isEntity: boolean;
      isAbsentee: boolean;
      mailingState: string | null;
      ownerParcelCount: number;
    }>
  > {
    const exclusionDays = this.config.get<number>('digestExclusionDays') ?? 90;
    const resendDelta = this.config.get<number>('digestResendScoreDelta') ?? 15;
    const cutoff = new Date(Date.now() - exclusionDays * 24 * 60 * 60 * 1000);

    // Latest score per active commercial parcel via raw query for efficiency
    const latestScores = await this.prisma.$queryRaw<
      Array<{
        parcelId: string;
        pin: string;
        situsAddress: string | null;
        landUseCode: string | null;
        propType: string | null;
        deedDate: Date | null;
        total: number;
        components: ScoreComponents;
        ownerName: string | null;
        isEntity: boolean | null;
        isAbsentee: boolean | null;
        mailingState: string | null;
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
        s.total,
        s.components,
        o."nameRaw" AS "ownerName",
        o."isEntity",
        o."isAbsentee",
        o."mailingState",
        p."ownerId"
      FROM "Parcel" p
      INNER JOIN "Score" s ON s."parcelId" = p.id
      LEFT JOIN "Owner" o ON o.id = p."ownerId"
      WHERE p."isActive" = true AND p."isCommercial" = true
      ORDER BY p.id, s."scoredAt" DESC
    `;

    // Sort by score desc globally
    latestScores.sort((a, b) => b.total - a.total);

    // Prior digest leads for exclusion
    const recentLeads = await this.prisma.lead.findMany({
      where: {
        createdAt: { gte: cutoff },
        digestId: { not: null },
      },
      select: { parcelId: true, createdAt: true },
    });
    const recentlySent = new Set(recentLeads.map((l) => l.parcelId));

    // Prior scores at last digest time approx: last lead's score snapshot not stored;
    // use previous Score row before latest when checking +15 rule.
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
        // Allow re-send only if score increased by resendDelta vs prior score
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

    return selected.map((r) => ({
      parcelId: r.parcelId,
      pin: r.pin,
      situsAddress: r.situsAddress,
      landUseCode: r.landUseCode,
      propType: r.propType,
      deedDate: r.deedDate,
      score: r.total,
      components: r.components,
      ownerName: r.ownerName ?? 'UNKNOWN',
      isEntity: r.isEntity ?? false,
      isAbsentee: r.isAbsentee ?? false,
      mailingState: r.mailingState,
      ownerParcelCount: r.ownerParcelCount,
    }));
  }

  async preview(send = false): Promise<DigestPreviewResult & { digestId?: string }> {
    const topN = this.config.get<number>('digestTopN') ?? 10;
    const homeState = this.config.get<string>('countyHomeState') ?? 'SC';
    const linkBase =
      this.config.get<string>('countyParcelLinkBase') ??
      'https://www.greenvillecounty.org/appsas400/RealProperty/';
    const candidates = await this.selectTopLeads(topN);

    const weekOf = formatWeekOf(new Date());
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
      });

      return {
        rank: i + 1,
        pin: c.pin,
        situsAddress: c.situsAddress ?? '(no situs address)',
        landUse: c.propType ?? c.landUseCode ?? 'Unknown',
        score: c.score,
        whyNow,
        ownerName: c.ownerName,
        parcelLink: linkBase,
      };
    });

    const countyName = this.config.get<string>('countyName') ?? 'Greenville';
    const subject = `${countyName} CRE Leads — Week of ${weekOf} (${leads.length} new)`;
    const html = renderDigestHtml({
      weekOf,
      countyName,
      leads,
    });

    if (!send) {
      return { subject, html, leads };
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

    this.logger.log(`Digest ${digest.id} sent with ${leads.length} leads`);
    return { subject, html, leads, digestId: digest.id };
  }

  async sendWeekly(): Promise<{ digestId: string; leadCount: number }> {
    const result = await this.preview(true);
    return { digestId: result.digestId!, leadCount: result.leads.length };
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