import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class CrmSyncService {
  private readonly logger = new Logger(CrmSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Push contacted/deal leads to CRM_WEBHOOK_URL (HubSpot/Follow Up Boss compatible JSON).
   */
  async syncEligible(statuses: string[] = ['contacted', 'deal']): Promise<{
    attempted: number;
    synced: number;
    skipped: number;
  }> {
    const webhook = (this.config.get<string>('crmWebhookUrl') || '').trim();
    const provider = this.config.get<string>('crmProvider') || 'webhook';

    const leads = await this.prisma.lead.findMany({
      where: { status: { in: statuses } },
      include: {
        parcel: {
          include: {
            owner: { include: { contacts: { take: 3, orderBy: { createdAt: 'desc' } } } },
            scores: { orderBy: { scoredAt: 'desc' }, take: 1 },
          },
        },
        crmSyncs: { where: { status: 'success' }, take: 1 },
      },
      take: 100,
    });

    let synced = 0;
    let skipped = 0;
    let attempted = 0;

    for (const lead of leads) {
      if (lead.crmSyncs.length) {
        skipped += 1;
        continue;
      }
      attempted += 1;

      const contact = lead.parcel.owner?.contacts[0];
      const payload = {
        provider,
        leadId: lead.id,
        status: lead.status,
        leadType: lead.leadType,
        whyNow: lead.whyNow,
        score: lead.parcel.scores[0]?.total ?? null,
        parcel: {
          pin: lead.parcel.pin,
          situsAddress: lead.parcel.situsAddress,
          propType: lead.parcel.propType,
          fairMarketVal: lead.parcel.fairMarketVal,
        },
        owner: lead.parcel.owner
          ? {
              name: lead.parcel.owner.nameRaw,
              mailingState: lead.parcel.owner.mailingState,
              isEntity: lead.parcel.owner.isEntity,
            }
          : null,
        contact: contact
          ? { name: contact.name, phone: contact.phone, email: contact.email }
          : null,
      };

      if (!webhook) {
        await this.prisma.crmSync.create({
          data: {
            leadId: lead.id,
            provider,
            status: 'dry_run',
            payload: payload as unknown as Prisma.InputJsonValue,
          },
        });
        synced += 1;
        continue;
      }

      try {
        const res = await fetch(webhook, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+crm)',
            ...(this.config.get<string>('crmWebhookToken')
              ? { Authorization: `Bearer ${this.config.get<string>('crmWebhookToken')}` }
              : {}),
          },
          body: JSON.stringify(payload),
        });
        const bodyText = await res.text();
        let externalId: string | undefined;
        try {
          const json = JSON.parse(bodyText) as { id?: string };
          externalId = json.id;
        } catch {
          /* ignore */
        }

        await this.prisma.crmSync.create({
          data: {
            leadId: lead.id,
            provider,
            externalId: externalId ?? null,
            status: res.ok ? 'success' : 'failed',
            payload: payload as unknown as Prisma.InputJsonValue,
            error: res.ok ? null : `HTTP ${res.status}: ${bodyText.slice(0, 300)}`,
          },
        });
        if (res.ok) synced += 1;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.warn(`CRM sync failed for ${lead.id}: ${message}`);
        await this.prisma.crmSync.create({
          data: {
            leadId: lead.id,
            provider,
            status: 'failed',
            payload: payload as unknown as Prisma.InputJsonValue,
            error: message,
          },
        });
      }
    }

    return { attempted, synced, skipped };
  }
}
