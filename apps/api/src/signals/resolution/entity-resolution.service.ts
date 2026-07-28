import { Injectable, Logger } from '@nestjs/common';
import { normalizeAddress, normalizeCompanyName } from '@cre/shared';
import { PrismaService } from '../../prisma/prisma.service';

export type CompanyResolveResult = {
  companyId: string;
  created: boolean;
  method: 'exact' | 'alias' | 'trgm' | 'created';
};

export type SiteResolveResult = {
  siteId: string;
  parcelId: string | null;
  matchMethod: string | null;
  matchConf: number | null;
};

@Injectable()
export class EntityResolutionService {
  private readonly logger = new Logger(EntityResolutionService.name);

  constructor(private readonly prisma: PrismaService) {}

  async resolveCompany(input: {
    name: string;
    source: string;
    dotNumber?: string;
    naics?: string;
  }): Promise<CompanyResolveResult> {
    const canonicalName = input.name.trim();
    const normalizedName = normalizeCompanyName(canonicalName);
    if (!normalizedName) {
      throw new Error('Cannot resolve empty company name');
    }

    if (input.dotNumber) {
      const byDot = await this.prisma.company.findUnique({
        where: { dotNumber: input.dotNumber },
      });
      if (byDot) {
        await this.ensureAlias(byDot.id, canonicalName, normalizedName, input.source);
        return { companyId: byDot.id, created: false, method: 'exact' };
      }
    }

    const exact = await this.prisma.company.findUnique({ where: { normalizedName } });
    if (exact) {
      if (input.dotNumber && !exact.dotNumber) {
        await this.prisma.company.update({
          where: { id: exact.id },
          data: { dotNumber: input.dotNumber, naics: input.naics ?? exact.naics },
        });
      }
      return { companyId: exact.id, created: false, method: 'exact' };
    }

    const alias = await this.prisma.companyAlias.findFirst({
      where: { normalizedName },
      orderBy: { id: 'asc' },
    });
    if (alias) {
      return { companyId: alias.companyId, created: false, method: 'alias' };
    }

    const fuzzy = await this.prisma.$queryRaw<Array<{ id: string; score: number }>>`
      SELECT id, similarity("normalizedName", ${normalizedName}) AS score
      FROM "Company"
      WHERE similarity("normalizedName", ${normalizedName}) >= 0.65
      ORDER BY score DESC
      LIMIT 1
    `;
    const best = fuzzy[0];
    if (best && best.score >= 0.85) {
      await this.ensureAlias(best.id, canonicalName, normalizedName, input.source);
      return { companyId: best.id, created: false, method: 'trgm' };
    }
    if (best && best.score >= 0.65) {
      await this.prisma.resolutionReview.create({
        data: {
          kind: 'company',
          status: 'pending',
          rawName: canonicalName,
          normalizedName,
          candidateId: best.id,
          candidateScore: best.score,
          payload: { source: input.source, dotNumber: input.dotNumber ?? null },
        },
      });
    }

    const created = await this.prisma.company.create({
      data: {
        canonicalName,
        normalizedName,
        dotNumber: input.dotNumber,
        naics: input.naics,
      },
    });
    return { companyId: created.id, created: true, method: 'created' };
  }

  async resolveSite(input: {
    companyId: string;
    rawAddress?: string | null;
  }): Promise<SiteResolveResult | null> {
    const raw = (input.rawAddress || '').trim();
    if (!raw) return null;
    const normalized = normalizeAddress(raw);

    const existing = await this.prisma.site.findFirst({
      where: { companyId: input.companyId, normalized },
    });
    if (existing) {
      await this.prisma.site.update({
        where: { id: existing.id },
        data: { lastSeenAt: new Date() },
      });
      return {
        siteId: existing.id,
        parcelId: existing.parcelId,
        matchMethod: existing.matchMethod,
        matchConf: existing.matchConf,
      };
    }

    let parcelId: string | null = null;
    let matchMethod: string | null = null;
    let matchConf: number | null = null;

    const tokens = normalized.split(' ').filter((t) => t.length > 1).slice(0, 4);
    if (tokens.length >= 2) {
      const like = `%${tokens.join('%')}%`;
      const candidates = await this.prisma.$queryRaw<
        Array<{ id: string; situs: string | null; score: number }>
      >`
        SELECT
          id,
          "situsAddress" AS situs,
          similarity(
            regexp_replace(upper(coalesce("situsAddress", '')), '[^A-Z0-9 ]', ' ', 'g'),
            ${normalized}
          ) AS score
        FROM "Parcel"
        WHERE "isActive" = true
          AND "situsAddress" IS NOT NULL
          AND upper("situsAddress") LIKE ${like}
        ORDER BY score DESC
        LIMIT 8
      `;

      const exact = candidates.find(
        (c) => normalizeAddress(c.situs) === normalized,
      );
      if (exact) {
        parcelId = exact.id;
        matchMethod = 'address_exact';
        matchConf = 1;
      } else if (candidates[0] && candidates[0].score >= 0.7) {
        parcelId = candidates[0].id;
        matchMethod = 'address_fuzzy';
        matchConf = candidates[0].score;
      } else if (candidates[0] && candidates[0].score >= 0.5) {
        await this.prisma.resolutionReview.create({
          data: {
            kind: 'site',
            status: 'pending',
            rawAddress: raw,
            normalizedName: normalized,
            candidateId: candidates[0].id,
            candidateScore: candidates[0].score,
            payload: { companyId: input.companyId },
          },
        });
      }
    }

    if (!parcelId) {
      this.logger.debug(`Site unmatched (company-only): ${normalized}`);
    }

    const site = await this.prisma.site.create({
      data: {
        companyId: input.companyId,
        parcelId,
        rawAddress: raw,
        normalized,
        matchMethod,
        matchConf,
        isPrimary: true,
      },
    });

    return {
      siteId: site.id,
      parcelId: site.parcelId,
      matchMethod: site.matchMethod,
      matchConf: site.matchConf,
    };
  }

  private async ensureAlias(
    companyId: string,
    alias: string,
    normalizedName: string,
    source: string,
  ) {
    const exists = await this.prisma.companyAlias.findFirst({
      where: { companyId, normalizedName },
    });
    if (exists) return;
    await this.prisma.companyAlias.create({
      data: { companyId, alias, normalizedName, source },
    });
  }
}
