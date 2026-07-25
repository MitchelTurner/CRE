import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  CONFIG_KEYS,
  DEFAULT_SUBMARKET_BANDS,
  type SubmarketBand,
} from '@cre/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../app-config/app-config.service';
import { EmailService } from '../digest/email.service';
import { MatchingService } from './matching.service';
import { rankScore } from './matching.util';
import { renderEventBriefHtml, templateOpener } from './brief.template';
import { LlmService } from '../llm/llm.service';

@Injectable()
export class BriefService {
  private readonly logger = new Logger(BriefService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly matching: MatchingService,
    private readonly email: EmailService,
    private readonly config: ConfigService,
    private readonly llm: LlmService,
    private readonly appConfig: AppConfigService,
  ) {}

  async generate(eventId: string, emailAgent = false) {
    const event = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        attendees: {
          include: {
            person: {
              include: {
                ownerMatches: {
                  where: { OR: [{ confirmed: true }, { confirmed: null }] },
                  include: {
                    owner: {
                      include: {
                        parcels: {
                          where: { isActive: true, isCommercial: true },
                          include: {
                            scores: { orderBy: { scoredAt: 'desc' }, take: 1 },
                          },
                          take: 5,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!event) throw new NotFoundException(`Event ${eventId} not found`);

    const bands = await this.appConfig.getJson<SubmarketBand[]>(
      CONFIG_KEYS.SUBMARKET_BANDS,
      DEFAULT_SUBMARKET_BANDS,
    );

    // Ensure matching ran for attendees
    for (const a of event.attendees) {
      if (!a.person.ownerMatches.length) {
        await this.matching.matchPerson(a.personId);
      }
    }

    const refreshed = await this.prisma.event.findUnique({
      where: { id: eventId },
      include: {
        attendees: {
          include: {
            person: {
              include: {
                ownerMatches: {
                  where: { confirmed: { not: false } },
                  include: {
                    owner: {
                      include: {
                        parcels: {
                          where: { isActive: true, isCommercial: true },
                          include: {
                            scores: { orderBy: { scoredAt: 'desc' }, take: 1 },
                          },
                          take: 5,
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });
    if (!refreshed) throw new NotFoundException(`Event ${eventId} not found`);

    const matchRows = [];
    const unmatched = [];

    for (const a of refreshed.attendees) {
      const best = a.person.ownerMatches
        .map((m) => {
          const bestScore = Math.max(
            0,
            ...m.owner.parcels.map((p) => p.scores[0]?.total ?? 0),
          );
          return { m, rank: rankScore(m.confidence, bestScore) };
        })
        .sort((x, y) => y.rank - x.rank)[0];

      if (!best || a.person.ownerMatches.some((m) => m.confirmed === false && m.ownerId === best.m.ownerId)) {
        if (['sponsor', 'speaker'].includes(a.role)) {
          unmatched.push({
            name: a.person.nameRaw,
            company: a.person.company,
            role: a.role,
          });
        }
        continue;
      }

      const parcels = best.m.owner.parcels.map((p) => {
        const holdYears = p.deedDate
          ? Math.floor((Date.now() - p.deedDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000))
          : null;
        return {
          address: p.situsAddress || p.pin,
          landUse: p.propType || p.landUseCode || 'CRE',
          holdYears,
          score: p.scores[0]?.total ?? null,
          submarket: p.submarket,
        };
      });
      const top = parcels[0];
      const band = top?.submarket ? bands.find((b) => b.id === top.submarket) : undefined;
      const marketBandNote =
        band && band.capRateLow != null && band.capRateHigh != null
          ? `${band.label} often clears ~${band.capRateLow}–${band.capRateHigh}%`
          : null;
      let opener = templateOpener({
        personName: a.person.nameRaw,
        parcelAddress: top?.address ?? 'your Greenville property',
        holdYears: top?.holdYears ?? null,
        marketBandNote,
      });
      if (this.llm.enabled && this.config.get<boolean>('llmOpenerPolish')) {
        try {
          const polished = await this.llm.completeJson<{ opener: string }>({
            system: 'Polish a short CRE investment-sales opener. Keep under 40 words. No hype.',
            user: opener,
            schemaHint: '{ "opener": string }',
          });
          opener = polished.data.opener || opener;
        } catch {
          /* keep template */
        }
      }

      matchRows.push({
        personName: a.person.nameRaw,
        company: a.person.company,
        role: a.role,
        confidence: best.m.confidence,
        method: best.m.method,
        ownerName: best.m.owner.nameRaw,
        parcels,
        opener,
        rank: best.rank,
      });
    }

    matchRows.sort((a, b) => b.rank - a.rank);

    const html = renderEventBriefHtml({
      eventName: refreshed.name,
      startsAt: refreshed.startsAt.toLocaleString('en-US', {
        timeZone: 'America/New_York',
      }),
      venue: refreshed.venue,
      hostOrg: refreshed.hostOrg,
      ownerDensity: refreshed.ownerDensity,
      matches: matchRows,
      unmatched,
    });

    const brief = await this.prisma.eventBrief.create({
      data: {
        eventId,
        htmlBody: html,
        matchCount: matchRows.length,
      },
    });

    if (emailAgent) {
      const recipients = this.config.get<string[]>('digestRecipients') ?? [];
      if (recipients.length) {
        await this.email.send({
          to: recipients,
          subject: `Event brief: ${refreshed.name} (${matchRows.length} matches)`,
          html,
        });
      }
    }

    this.logger.log(`Brief ${brief.id} for event ${eventId} matches=${matchRows.length}`);
    return brief;
  }

  /** Auto-generate briefs 5 days before high-density approved events. */
  async autoGenerateUpcoming(): Promise<number> {
    const inFiveDays = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    const windowStart = new Date(inFiveDays.getTime() - 12 * 60 * 60 * 1000);
    const windowEnd = new Date(inFiveDays.getTime() + 12 * 60 * 60 * 1000);
    const events = await this.prisma.event.findMany({
      where: {
        status: 'approved',
        ownerDensity: 'high',
        startsAt: { gte: windowStart, lte: windowEnd },
      },
      take: 20,
    });
    let n = 0;
    for (const e of events) {
      await this.generate(e.id, true);
      n += 1;
    }
    return n;
  }
}
