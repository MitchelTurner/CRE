import {
  BadRequestException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HOT_SIGNAL_TYPES } from '@cre/shared';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../llm/llm.service';
import { REPORT_QUERIES } from '../reports/report-queries';

const SYSTEM = `You are the Greenville CRE Lead Engine analytics co-pilot for an investment-sales agent in Greenville County, SC.
Answer ONLY from the provided FACTS JSON. If facts are insufficient, say what is missing.
Never invent owners, phones, emails, sale prices, or matches.
Be concise, practical, and action-oriented (calls, events, catalysts).
Do not scrape or request LinkedIn. Ethics: public records + agent paste only.
Format with short paragraphs or bullets. Cite PINs when recommending parcels.`;

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
    private readonly config: ConfigService,
  ) {}

  status() {
    const s = this.llm.status;
    return {
      ...s,
      ready: s.enabled && s.hasKey,
      note: s.enabled && s.hasKey
        ? 'AI analytics ready'
        : 'Set LLM_ENABLED=true and ANTHROPIC_API_KEY on Railway to enable Ask AI',
    };
  }

  async ask(question: string, pin?: string) {
    const q = question?.trim();
    if (!q) throw new BadRequestException('question required');
    if (q.length > 2000) throw new BadRequestException('question too long');

    this.requireLlm();
    const facts = await this.buildFacts(pin);
    const result = await this.llm.completeJson<{
      answer: string;
      suggestedActions?: string[];
      citedPins?: string[];
    }>({
      system: SYSTEM,
      user: `QUESTION:\n${q}\n\nFACTS (JSON):\n${JSON.stringify(facts)}`,
      schemaHint:
        '{ "answer": string, "suggestedActions"?: string[], "citedPins"?: string[] }',
      maxTokens: 1500,
    });

    return {
      answer: result.data.answer,
      suggestedActions: result.data.suggestedActions ?? [],
      citedPins: result.data.citedPins ?? [],
      usedLlm: true,
      tokensIn: result.tokensIn,
      tokensOut: result.tokensOut,
      model: this.llm.status.model,
    };
  }

  async explainParcel(pin: string) {
    this.requireLlm();
    const facts = await this.buildParcelFacts(pin);
    if (!facts) throw new BadRequestException(`Parcel ${pin} not found`);

    const result = await this.llm.completeJson<{
      summary: string;
      callAngle: string;
      risks: string[];
    }>({
      system: SYSTEM,
      user: `Explain this parcel for an investment-sales call. FACTS:\n${JSON.stringify(facts)}`,
      schemaHint: '{ "summary": string, "callAngle": string, "risks": string[] }',
      maxTokens: 900,
    });

    return { pin, ...result.data, usedLlm: true };
  }

  async polishOutreach(pin: string, tone?: string) {
    if (!this.status().ready) {
      // Soft path — callers can still get template via OutreachService.
      throw new ServiceUnavailableException(this.status().note);
    }
    const parcel = await this.prisma.parcel.findUnique({
      where: { pin },
      include: {
        owner: { include: { contacts: { take: 3, orderBy: { createdAt: 'desc' } } } },
        leads: { orderBy: { createdAt: 'desc' }, take: 1 },
        scores: { orderBy: { scoredAt: 'desc' }, take: 1 },
        signals: {
          where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
          take: 12,
          orderBy: { detectedAt: 'desc' },
        },
      },
    });
    if (!parcel) throw new BadRequestException(`Parcel ${pin} not found`);

    const contact = parcel.owner?.contacts.find((c) => c.phone || c.email);
    const result = await this.llm.completeJson<{
      callScript: string;
      emailSubject: string;
      emailBody: string;
    }>({
      system: `${SYSTEM}
Polish CRE investment-sales outreach. Keep confidential, no hype, no fabricated comps.
Tone: ${tone?.trim() || 'professional and concise'}. Call script under 90 words; email under 140 words.`,
      user: JSON.stringify({
        pin: parcel.pin,
        address: parcel.situsAddress,
        owner: parcel.owner?.nameRaw,
        propType: parcel.propType,
        submarket: parcel.submarket,
        whyNow: parcel.leads[0]?.whyNow,
        score: parcel.scores[0]?.total,
        components: parcel.scores[0]?.components,
        signals: parcel.signals.map((s) => s.type),
        contactName: contact?.name || parcel.owner?.sosRegisteredAgent,
        agentName: this.config.get<string>('outreachAgentName') || 'your CRE advisor',
      }),
      schemaHint: '{ "callScript": string, "emailSubject": string, "emailBody": string }',
      maxTokens: 1200,
    });

    return {
      pin,
      ...result.data,
      usedLlm: true,
      contact: contact
        ? {
            name: contact.name,
            phone: contact.phone,
            email: contact.email,
            role: contact.role,
            source: contact.source,
          }
        : null,
    };
  }

  async marketNarrative() {
    this.requireLlm();
    const homeState = this.config.get<string>('countyHomeState') ?? 'SC';
    const countyName = this.config.get<string>('countyName') ?? 'Greenville';
    const periodStart = new Date();
    periodStart.setMonth(periodStart.getMonth() - 3);
    const periodEnd = new Date();

    const [byLandUse, bySubmarket, holdBuckets, absenteeRows, compsRows, topScores, hot] =
      await Promise.all([
        this.prisma.$queryRawUnsafe<Array<{ bucket: string; parcel_count: number }>>(
          REPORT_QUERIES.byLandUse,
        ),
        this.prisma.$queryRawUnsafe<Array<{ bucket: string; parcel_count: number }>>(
          REPORT_QUERIES.bySubmarket,
        ),
        this.prisma.$queryRawUnsafe<Array<{ bucket: string; parcel_count: number }>>(
          REPORT_QUERIES.holdBuckets,
        ),
        this.prisma.$queryRawUnsafe<
          Array<{ total: number; absentee: number; out_of_state: number }>
        >(REPORT_QUERIES.absenteeShare, homeState),
        this.prisma.$queryRawUnsafe<
          Array<{
            comp_count: number;
            priced_count: number;
            avg_price: number;
            median_price: number;
          }>
        >(REPORT_QUERIES.saleComps, periodStart, periodEnd),
        this.prisma.score.findMany({
          orderBy: { scoredAt: 'desc' },
          take: 8,
          include: {
            parcel: { select: { pin: true, situsAddress: true, propType: true, submarket: true } },
          },
        }),
        this.prisma.signal.findMany({
          where: {
            type: { in: [...HOT_SIGNAL_TYPES] },
            detectedAt: { gte: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000) },
          },
          orderBy: { detectedAt: 'desc' },
          take: 15,
          select: { type: true, parcel: { select: { pin: true } } },
        }),
      ]);

    const facts = {
      countyName,
      period: { start: periodStart.toISOString(), end: periodEnd.toISOString() },
      byLandUse: byLandUse.slice(0, 10),
      bySubmarket: bySubmarket.slice(0, 10),
      holdBuckets,
      absentee: absenteeRows[0] ?? null,
      comps: compsRows[0] ?? null,
      recentHighScores: topScores.map((s) => ({
        pin: s.parcel.pin,
        address: s.parcel.situsAddress,
        score: s.total,
        propType: s.parcel.propType,
        submarket: s.parcel.submarket,
      })),
      recentCatalysts: hot.map((h) => ({ type: h.type, pin: h.parcel.pin })),
    };

    const result = await this.llm.completeJson<{
      headline: string;
      narrative: string;
      opportunities: string[];
      watchouts: string[];
    }>({
      system: SYSTEM,
      user: `Write a short quarterly market narrative for the agent (relationship use, not an appraisal). FACTS:\n${JSON.stringify(facts)}`,
      schemaHint:
        '{ "headline": string, "narrative": string, "opportunities": string[], "watchouts": string[] }',
      maxTokens: 1400,
    });

    return { ...result.data, usedLlm: true, factsSummary: facts };
  }

  private requireLlm() {
    const s = this.status();
    if (!s.ready) {
      throw new ServiceUnavailableException(s.note);
    }
  }

  private async buildFacts(pin?: string) {
    const now = new Date();
    const [
      commercialParcels,
      leadPipeline,
      callQueue,
      hotSignals,
      upcomingEvents,
      submarkets,
      parcelFocus,
    ] = await Promise.all([
      this.prisma.parcel.count({ where: { isActive: true, isCommercial: true } }),
      this.prisma.lead.groupBy({
        by: ['status'],
        _count: { _all: true },
      }),
      this.prisma.lead.findMany({
        where: {
          status: { in: ['new', 'sent', 'contacted'] },
          OR: [{ snoozedUntil: null }, { snoozedUntil: { lt: now } }],
        },
        orderBy: { updatedAt: 'desc' },
        take: 8,
        include: {
          parcel: {
            include: {
              scores: { orderBy: { scoredAt: 'desc' }, take: 1, select: { total: true } },
              signals: {
                where: { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
                select: { type: true },
                take: 6,
              },
              owner: { select: { nameRaw: true, isAbsentee: true, mailingState: true } },
            },
          },
        },
      }),
      this.prisma.signal.findMany({
        where: {
          type: { in: [...HOT_SIGNAL_TYPES] },
          detectedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
          OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        },
        orderBy: { detectedAt: 'desc' },
        take: 15,
        include: {
          parcel: {
            select: {
              pin: true,
              situsAddress: true,
              scores: { orderBy: { scoredAt: 'desc' }, take: 1, select: { total: true } },
            },
          },
        },
      }),
      this.prisma.event.findMany({
        where: { startsAt: { gte: now }, status: { not: 'hidden' } },
        orderBy: { startsAt: 'asc' },
        take: 10,
        select: {
          name: true,
          startsAt: true,
          venue: true,
          hostOrg: true,
          ownerDensity: true,
          category: true,
          sourceId: true,
        },
      }),
      this.prisma.parcel
        .groupBy({
          by: ['submarket'],
          where: { isActive: true, isCommercial: true, submarket: { not: null } },
          _count: { _all: true },
        })
        .then((rows) =>
          rows.sort((a, b) => b._count._all - a._count._all).slice(0, 10),
        ),
      pin ? this.buildParcelFacts(pin) : Promise.resolve(null),
    ]);

    return {
      county: this.config.get<string>('countyName') ?? 'Greenville',
      asOf: now.toISOString(),
      inventory: { commercialParcels },
      pipelineByStatus: Object.fromEntries(
        leadPipeline.map((r) => [r.status, r._count._all]),
      ),
      callQueue: callQueue.map((l) => ({
        pin: l.parcel.pin,
        address: l.parcel.situsAddress,
        score: l.parcel.scores[0]?.total ?? null,
        whyNow: l.whyNow,
        owner: l.parcel.owner?.nameRaw,
        absentee: l.parcel.owner?.isAbsentee,
        signals: l.parcel.signals.map((s) => s.type),
      })),
      hotCatalysts: hotSignals.map((s) => ({
        type: s.type,
        pin: s.parcel.pin,
        address: s.parcel.situsAddress,
        score: s.parcel.scores[0]?.total ?? null,
      })),
      upcomingEvents,
      submarketCounts: submarkets.map((s) => ({
        submarket: s.submarket,
        count: s._count._all,
      })),
      focusedParcel: parcelFocus,
    };
  }

  private async buildParcelFacts(pin: string) {
    const parcel = await this.prisma.parcel.findUnique({
      where: { pin },
      include: {
        owner: {
          include: {
            contacts: { take: 5 },
            parcels: {
              where: { isActive: true, isCommercial: true },
              select: { pin: true, situsAddress: true, propType: true },
              take: 8,
            },
          },
        },
        scores: { orderBy: { scoredAt: 'desc' }, take: 1 },
        signals: { orderBy: { detectedAt: 'desc' }, take: 15 },
        saleComps: { orderBy: { recordedAt: 'desc' }, take: 5 },
        leads: { orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!parcel) return null;
    return {
      pin: parcel.pin,
      address: parcel.situsAddress,
      propType: parcel.propType,
      landUse: parcel.landUseCode,
      submarket: parcel.submarket,
      deedDate: parcel.deedDate,
      fairMarketVal: parcel.fairMarketVal,
      salePrice: parcel.salePrice,
      totalTax: parcel.totalTax,
      paidDate: parcel.paidDate,
      floodZone: parcel.floodZone,
      owner: parcel.owner
        ? {
            name: parcel.owner.nameRaw,
            absentee: parcel.owner.isAbsentee,
            entity: parcel.owner.isEntity,
            mailingState: parcel.owner.mailingState,
            sosStatus: parcel.owner.sosStatus,
            portfolioScore: parcel.owner.portfolioScore,
            contacts: parcel.owner.contacts.map((c) => ({
              name: c.name,
              role: c.role,
              hasPhone: Boolean(c.phone),
              hasEmail: Boolean(c.email),
              source: c.source,
            })),
            relatedParcels: parcel.owner.parcels,
          }
        : null,
      score: parcel.scores[0]
        ? { total: parcel.scores[0].total, components: parcel.scores[0].components }
        : null,
      signals: parcel.signals.map((s) => ({
        type: s.type,
        detectedAt: s.detectedAt,
        payload: s.payload,
      })),
      saleComps: parcel.saleComps,
      whyNow: parcel.leads[0]?.whyNow ?? null,
      leadStatus: parcel.leads[0]?.status ?? null,
    };
  }
}
