import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  buildOutreachDrafts,
  CONFIG_KEYS,
  DEFAULT_SUBMARKET_BANDS,
  type SubmarketBand,
} from '@cre/shared';
import { PrismaService } from '../prisma/prisma.service';
import { AppConfigService } from '../app-config/app-config.service';
import { LlmService } from '../llm/llm.service';

@Injectable()
export class OutreachService {
  private readonly logger = new Logger(OutreachService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly appConfig: AppConfigService,
    private readonly llm: LlmService,
  ) {}

  /**
   * Draft outreach for a parcel.
   * Prefer LLM email/call scripts when enabled; fall back to template otherwise.
   */
  async draftsForParcel(pin: string, opts?: { llm?: boolean | 'auto' }) {
    const mode = opts?.llm ?? 'auto';
    const wantLlm =
      mode === true || (mode === 'auto' && this.llm.enabled && this.llm.status.hasKey);

    const template = await this.templateDrafts(pin);
    if (!wantLlm) {
      return { ...template, usedLlm: false, source: 'template' as const };
    }

    try {
      const ai = await this.llmDrafts(pin);
      return { ...ai, usedLlm: true, source: 'llm' as const };
    } catch (err) {
      this.logger.warn(
        `LLM outreach failed for ${pin}, using template: ${err instanceof Error ? err.message : String(err)}`,
      );
      return {
        ...template,
        usedLlm: false,
        source: 'template' as const,
        fallbackReason: err instanceof Error ? err.message : String(err),
      };
    }
  }

  async draftsForLead(leadId: string, opts?: { llm?: boolean | 'auto' }) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { parcel: true },
    });
    if (!lead) throw new NotFoundException(`Lead ${leadId} not found`);
    return this.draftsForParcel(lead.parcel.pin, opts);
  }

  private async templateDrafts(pin: string) {
    const parcel = await this.loadParcel(pin);
    const contact =
      parcel.owner?.contacts.find((c) => c.phone || c.email) ?? parcel.owner?.contacts[0];
    const whyNow =
      parcel.leads[0]?.whyNow ||
      `Score ${parcel.scores[0]?.total ?? 'n/a'} — reviewing for investment-sales outreach.`;

    const bands = await this.appConfig.getJson<SubmarketBand[]>(
      CONFIG_KEYS.SUBMARKET_BANDS,
      DEFAULT_SUBMARKET_BANDS,
    );
    const band = parcel.submarket
      ? bands.find((b) => b.id === parcel.submarket)
      : undefined;
    const marketBandNote =
      band && band.capRateLow != null && band.capRateHigh != null
        ? `${band.label} typically clears ~${band.capRateLow}–${band.capRateHigh}% cap${
            band.rentPsfNote ? ` (${band.rentPsfNote})` : ''
          }`
        : null;

    const drafts = buildOutreachDrafts({
      ownerName: parcel.owner?.nameRaw ?? 'Owner',
      situsAddress: parcel.situsAddress ?? `PIN ${parcel.pin}`,
      pin: parcel.pin,
      whyNow,
      propType: parcel.propType,
      contactName: contact?.name || parcel.owner?.sosRegisteredAgent || parcel.owner?.nameRaw,
      contactPhone: contact?.phone,
      contactEmail: contact?.email,
      agentName: this.config.get<string>('outreachAgentName') || undefined,
      countyName: this.config.get<string>('countyName') ?? 'Greenville',
      submarket: parcel.submarket,
      marketBandNote,
    });

    return {
      pin: parcel.pin,
      contact: contact
        ? {
            name: contact.name,
            phone: contact.phone,
            email: contact.email,
            role: contact.role,
            source: contact.source,
          }
        : null,
      ...drafts,
    };
  }

  private async llmDrafts(pin: string) {
    const parcel = await this.loadParcel(pin);
    const contact =
      parcel.owner?.contacts.find((c) => c.phone || c.email) ?? parcel.owner?.contacts[0];
    const scrape = parcel.signals.find((s) => s.type === 'property_scrape');
    const agentName =
      this.config.get<string>('outreachAgentName')?.trim() || 'your local CRE advisor';
    const county = this.config.get<string>('countyName') ?? 'Greenville';

    const result = await this.llm.completeJson<{
      callScript: string;
      emailSubject: string;
      emailBody: string;
    }>({
      system: `You write confidential CRE investment-sales outreach for ${county} County, SC.
Use ONLY the provided FACTS. Never invent phones, emails, sale prices, or comps.
Tone: professional, concise, no hype. Call script under 90 words. Email under 160 words.
Sign emails as ${agentName}. Mention specific catalysts from facts when present.`,
      user: JSON.stringify({
        pin: parcel.pin,
        address: parcel.situsAddress,
        owner: parcel.owner?.nameRaw,
        isEntity: parcel.owner?.isEntity,
        isAbsentee: parcel.owner?.isAbsentee,
        mailingState: parcel.owner?.mailingState,
        propType: parcel.propType,
        landUse: parcel.landUseCode,
        submarket: parcel.submarket,
        floodZone: parcel.floodZone,
        fairMarketVal: parcel.fairMarketVal,
        salePrice: parcel.salePrice,
        totalTax: parcel.totalTax,
        deedDate: parcel.deedDate,
        whyNow: parcel.leads[0]?.whyNow,
        score: parcel.scores[0]?.total,
        components: parcel.scores[0]?.components,
        signals: parcel.signals
          .filter((s) => s.type !== 'property_scrape')
          .slice(0, 12)
          .map((s) => ({ type: s.type, payload: s.payload })),
        scrapeSummary: scrape?.payload ?? null,
        contactName: contact?.name || parcel.owner?.sosRegisteredAgent || parcel.owner?.nameRaw,
        hasPhone: Boolean(contact?.phone),
        hasEmail: Boolean(contact?.email),
        agentName,
        agentPhone: this.config.get<string>('outreachAgentPhone') || null,
        agentEmail: this.config.get<string>('outreachAgentEmail') || null,
      }),
      schemaHint: '{ "callScript": string, "emailSubject": string, "emailBody": string }',
      maxTokens: 1400,
    });

    return {
      pin: parcel.pin,
      contact: contact
        ? {
            name: contact.name,
            phone: contact.phone,
            email: contact.email,
            role: contact.role,
            source: contact.source,
          }
        : null,
      callScript: result.data.callScript,
      emailSubject: result.data.emailSubject,
      emailBody: result.data.emailBody,
    };
  }

  private loadParcel(pin: string) {
    return this.prisma.parcel
      .findUnique({
        where: { pin },
        include: {
          owner: { include: { contacts: { orderBy: { createdAt: 'desc' }, take: 5 } } },
          leads: { orderBy: { createdAt: 'desc' }, take: 1 },
          scores: { orderBy: { scoredAt: 'desc' }, take: 1 },
          signals: {
            where: { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
            orderBy: { detectedAt: 'desc' },
            take: 20,
          },
        },
      })
      .then((p) => {
        if (!p) throw new NotFoundException(`Parcel ${pin} not found`);
        return p;
      });
  }
}
