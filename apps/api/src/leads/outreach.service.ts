import { Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { buildOutreachDrafts } from '@cre/shared';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OutreachService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  async draftsForParcel(pin: string) {
    const parcel = await this.prisma.parcel.findUnique({
      where: { pin },
      include: {
        owner: { include: { contacts: { orderBy: { createdAt: 'desc' }, take: 5 } } },
        leads: { orderBy: { createdAt: 'desc' }, take: 1 },
        scores: { orderBy: { scoredAt: 'desc' }, take: 1 },
      },
    });
    if (!parcel) throw new NotFoundException(`Parcel ${pin} not found`);

    const contact =
      parcel.owner?.contacts.find((c) => c.phone || c.email) ?? parcel.owner?.contacts[0];
    const whyNow =
      parcel.leads[0]?.whyNow ||
      `Score ${parcel.scores[0]?.total ?? 'n/a'} — reviewing for investment-sales outreach.`;

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

  async draftsForLead(leadId: string) {
    const lead = await this.prisma.lead.findUnique({
      where: { id: leadId },
      include: { parcel: true },
    });
    if (!lead) throw new NotFoundException(`Lead ${leadId} not found`);
    return this.draftsForParcel(lead.parcel.pin);
  }
}
