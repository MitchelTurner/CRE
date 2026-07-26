import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { createSosClient, type SosClient } from '../clients/sos.client';
import {
  createWebsiteContactClient,
  extractUrlsFromUnknown,
  type WebsiteContactClient,
} from '../clients/website-contact.client';

@Injectable()
export class OwnersService {
  private readonly logger = new Logger(OwnersService.name);
  private readonly sos: SosClient;
  private readonly website: WebsiteContactClient | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.sos = createSosClient(process.env);
    this.website = createWebsiteContactClient(process.env);
  }

  async getById(id: string) {
    const owner = await this.prisma.owner.findUnique({
      where: { id },
      include: {
        contacts: {
          orderBy: [{ source: 'asc' }, { name: 'asc' }],
        },
        parcels: {
          where: { isActive: true },
          select: {
            id: true,
            pin: true,
            situsAddress: true,
            landUseCode: true,
            propType: true,
            fairMarketVal: true,
            deedDate: true,
            scores: {
              orderBy: { scoredAt: 'desc' },
              take: 1,
              select: { total: true },
            },
          },
          take: 50,
          orderBy: { fairMarketVal: 'desc' },
        },
      },
    });
    if (!owner) throw new NotFoundException(`Owner ${id} not found`);

    const people = owner.contacts.map((c) => ({
      id: c.id,
      name: c.name,
      role: c.role,
      email: c.email,
      phone: c.phone,
      source: c.source,
      createdAt: c.createdAt,
    }));

    return {
      id: owner.id,
      nameRaw: owner.nameRaw,
      mailingAddress: owner.mailingAddress,
      mailingCity: owner.mailingCity,
      mailingState: owner.mailingState,
      mailingZip: owner.mailingZip,
      isEntity: owner.isEntity,
      isAbsentee: owner.isAbsentee,
      sosEntityId: owner.sosEntityId,
      sosStatus: owner.sosStatus,
      sosRegisteredAgent: owner.sosRegisteredAgent,
      sosAgentAddress: owner.sosAgentAddress,
      sosFetchedAt: owner.sosFetchedAt,
      websiteUrl: owner.websiteUrl,
      websiteFetchedAt: owner.websiteFetchedAt,
      portfolioScore: owner.portfolioScore,
      people,
      officers: people.filter((p) => p.source === 'sos'),
      websiteContacts: people.filter((p) => p.source === 'website'),
      parcels: owner.parcels.map((p) => ({
        id: p.id,
        pin: p.pin,
        situsAddress: p.situsAddress,
        landUseCode: p.landUseCode,
        propType: p.propType,
        fairMarketVal: p.fairMarketVal,
        deedDate: p.deedDate,
        score: p.scores[0]?.total ?? null,
      })),
    };
  }

  async refreshPeople(id: string) {
    const owner = await this.prisma.owner.findUnique({ where: { id } });
    if (!owner) throw new NotFoundException(`Owner ${id} not found`);

    const result = {
      sosOfficers: 0,
      websiteContacts: 0,
      websiteUrl: null as string | null,
      errors: [] as string[],
    };

    let hintUrls: string[] = [];
    if (owner.websiteUrl) hintUrls.push(owner.websiteUrl);
    if (owner.sosRaw) hintUrls.push(...extractUrlsFromUnknown(owner.sosRaw));
    hintUrls = [...new Set(hintUrls)].slice(0, 10);

    try {
      const entity = await this.sos.resolveEntity(owner.nameRaw);
      if (entity) {
        const websiteFromSos = entity.website ?? null;
        await this.prisma.owner.update({
          where: { id },
          data: {
            sosEntityId: entity.entityId ?? owner.sosEntityId,
            sosStatus: entity.status ?? owner.sosStatus,
            sosRegisteredAgent: entity.registeredAgent ?? owner.sosRegisteredAgent,
            sosAgentAddress: entity.agentAddress ?? owner.sosAgentAddress,
            sosFetchedAt: new Date(),
            sosRaw: (entity.raw as Prisma.InputJsonValue) ?? undefined,
            websiteUrl: websiteFromSos || owner.websiteUrl,
          },
        });

        if (websiteFromSos) {
          hintUrls = [websiteFromSos, ...hintUrls];
          result.websiteUrl = websiteFromSos;
        }
        if (entity.raw) {
          hintUrls.push(...extractUrlsFromUnknown(entity.raw));
        }

        if (entity.registeredAgent) {
          await this.upsertContact(id, {
            name: entity.registeredAgent,
            role: 'registered_agent',
            source: 'sos',
          });
          result.sosOfficers += 1;
        }

        const officers =
          entity.officers && entity.officers.length > 0
            ? entity.officers
            : (entity.members ?? []).map((name) => ({ name, role: 'officer' as string | null }));

        for (const officer of officers) {
          await this.upsertContact(id, {
            name: officer.name,
            role: officer.role || 'officer',
            source: 'sos',
          });
          result.sosOfficers += 1;
        }
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      result.errors.push(`SoS: ${msg}`);
      this.logger.warn(`SoS people refresh failed for ${owner.nameRaw}: ${msg}`);
    }

    if (this.website) {
      try {
        const site = await this.website.lookupCompany({
          companyName: owner.nameRaw,
          hintUrls: [...new Set(hintUrls)].slice(0, 10),
        });

        if (site.websiteUrl) {
          await this.prisma.owner.update({
            where: { id },
            data: {
              websiteUrl: site.websiteUrl,
              websiteFetchedAt: new Date(),
            },
          });
          result.websiteUrl = site.websiteUrl;
        } else {
          await this.prisma.owner.update({
            where: { id },
            data: { websiteFetchedAt: new Date() },
          });
        }

        for (const person of site.people) {
          if (!person.name && !person.email && !person.phone) continue;
          await this.upsertContact(id, {
            name:
              person.name ||
              (person.email ? `Website contact (${person.email.split('@')[0]})` : 'Website contact'),
            role: person.role || 'website_contact',
            email: person.email,
            phone: person.phone,
            source: 'website',
          });
          result.websiteContacts += 1;
        }

        const namedEmails = new Set(
          site.people.map((p) => p.email?.toLowerCase()).filter((e): e is string => Boolean(e)),
        );
        for (const email of site.emails) {
          if (namedEmails.has(email.toLowerCase())) continue;
          await this.upsertContact(id, {
            name: `Website contact (${email.split('@')[0]})`,
            role: 'website_contact',
            email,
            source: 'website',
          });
          result.websiteContacts += 1;
        }

        // Phones without a person — attach to first website contact or create orphan
        if (site.phones.length && result.websiteContacts === 0) {
          await this.upsertContact(id, {
            name: owner.nameRaw,
            role: 'website_contact',
            phone: site.phones[0],
            email: site.emails[0] ?? null,
            source: 'website',
          });
          result.websiteContacts += 1;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        result.errors.push(`Website: ${msg}`);
        this.logger.warn(`Website scrape failed for ${owner.nameRaw}: ${msg}`);
      }
    } else if (
      (this.config.get<string>('WEBSITE_SCRAPER_ENABLED') ?? 'true').toLowerCase() === 'false'
    ) {
      result.errors.push('Website scraper disabled (WEBSITE_SCRAPER_ENABLED=false)');
    }

    const detail = await this.getById(id);
    return { ...detail, refresh: result };
  }

  private async upsertContact(
    ownerId: string,
    data: {
      name: string;
      role: string;
      email?: string | null;
      phone?: string | null;
      source: string;
    },
  ) {
    const existing = await this.prisma.contact.findFirst({
      where: {
        ownerId,
        OR: [
          ...(data.email ? [{ email: data.email }] : []),
          {
            AND: [
              { name: { equals: data.name, mode: 'insensitive' as const } },
              { source: data.source },
            ],
          },
        ],
      },
    });

    if (existing) {
      return this.prisma.contact.update({
        where: { id: existing.id },
        data: {
          role: data.role || existing.role,
          email: data.email ?? existing.email,
          phone: data.phone ?? existing.phone,
          name: data.name || existing.name,
        },
      });
    }

    return this.prisma.contact.create({
      data: {
        ownerId,
        name: data.name,
        role: data.role,
        email: data.email ?? null,
        phone: data.phone ?? null,
        source: data.source,
      },
    });
  }
}
