import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import {
  capTrigramConfidence,
  companyBridgeConfidence,
  exactConfidence,
  filterSuppressed,
  isAmbiguousOwnerCount,
  normalizePersonName,
  shouldAutoInclude,
  type MatchCandidate,
} from './matching.util';

/**
 * Person → Owner matching (cheapest tier first).
 * Never fabricate matches. Ambiguous common names require manual confirmation.
 *
 * Ethics: only match against public directories / paste the agent lawfully has.
 */
@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(private readonly prisma: PrismaService) {}

  async matchPerson(personId: string): Promise<MatchCandidate[]> {
    const person = await this.prisma.person.findUnique({ where: { id: personId } });
    if (!person) return [];

    const rejected = await this.prisma.personOwnerMatch.findMany({
      where: { personId, confirmed: false },
      select: { ownerId: true },
    });
    const rejectedIds = new Set(rejected.map((r) => r.ownerId));

    const candidates: MatchCandidate[] = [];

    // Tier 1 — exact nameNormalized vs Owner / Contact
    const exactOwners = await this.prisma.owner.findMany({
      where: { nameNormalized: person.nameNormalized },
      select: { id: true },
      take: 20,
    });
    if (isAmbiguousOwnerCount(exactOwners.length)) {
      for (const o of exactOwners) {
        candidates.push({
          ownerId: o.id,
          confidence: exactConfidence(),
          method: 'exact',
          ambiguous: true,
        });
      }
    } else {
      for (const o of exactOwners) {
        candidates.push({
          ownerId: o.id,
          confidence: exactConfidence(),
          method: 'exact',
        });
      }
    }

    const contactHits = await this.prisma.contact.findMany({
      where: {
        OR: [
          { name: { equals: person.nameRaw, mode: 'insensitive' } },
          { name: { contains: person.nameRaw.split(/\s+/)[0] ?? person.nameRaw, mode: 'insensitive' } },
        ],
      },
      select: { ownerId: true, name: true },
      take: 20,
    });
    for (const c of contactHits) {
      if (!c.name) continue;
      if (normalizePersonName(c.name) !== person.nameNormalized) continue;
      candidates.push({
        ownerId: c.ownerId,
        confidence: exactConfidence(),
        method: 'contact_name',
      });
    }

    // Tier 2 — trigram via pg_trgm
    if (!candidates.some((c) => c.method === 'exact' && !c.ambiguous)) {
      try {
        const rows = await this.prisma.$queryRaw<
          Array<{ id: string; score: number }>
        >`
          SELECT id, similarity("nameNormalized", ${person.nameNormalized}) AS score
          FROM "Owner"
          WHERE similarity("nameNormalized", ${person.nameNormalized}) > 0.55
          ORDER BY score DESC
          LIMIT 10
        `;
        if (isAmbiguousOwnerCount(rows.length)) {
          for (const r of rows) {
            candidates.push({
              ownerId: r.id,
              confidence: capTrigramConfidence(Number(r.score)),
              method: 'trigram',
              ambiguous: true,
            });
          }
        } else {
          for (const r of rows) {
            candidates.push({
              ownerId: r.id,
              confidence: capTrigramConfidence(Number(r.score)),
              method: 'trigram',
            });
          }
        }
      } catch (err) {
        this.logger.warn(
          `pg_trgm query failed (extension missing?): ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    }

    // Tier 3 — company bridge to entity owners
    if (person.company?.trim()) {
      const companyNorm = normalizePersonName(person.company);
      try {
        const rows = await this.prisma.$queryRaw<
          Array<{ id: string; score: number }>
        >`
          SELECT id, similarity("nameNormalized", ${companyNorm}) AS score
          FROM "Owner"
          WHERE "isEntity" = true
            AND similarity("nameNormalized", ${companyNorm}) > 0.55
          ORDER BY score DESC
          LIMIT 5
        `;
        for (const r of rows) {
          candidates.push({
            ownerId: r.id,
            confidence: companyBridgeConfidence(),
            method: 'company',
          });
        }
      } catch {
        /* extension optional in tests */
      }
    }

    const filtered = filterSuppressed(candidates, rejectedIds).filter(shouldAutoInclude);

    for (const m of filtered) {
      await this.prisma.personOwnerMatch.upsert({
        where: {
          personId_ownerId: { personId, ownerId: m.ownerId },
        },
        create: {
          personId,
          ownerId: m.ownerId,
          confidence: m.confidence,
          method: m.method,
          confirmed: null,
        },
        update: {
          confidence: m.confidence,
          method: m.method,
        },
      });
    }

    return filtered;
  }

  async setConfirmation(
    personId: string,
    ownerId: string,
    confirmed: boolean,
  ): Promise<void> {
    await this.prisma.personOwnerMatch.upsert({
      where: { personId_ownerId: { personId, ownerId } },
      create: {
        personId,
        ownerId,
        confidence: 1,
        method: 'manual',
        confirmed,
      },
      update: { confirmed },
    });
  }

  async upsertPerson(input: {
    nameRaw: string;
    company?: string | null;
    title?: string | null;
    source: string;
    linkedinUrl?: string | null;
  }) {
    const nameNormalized = normalizePersonName(input.nameRaw);
    const existing = await this.prisma.person.findFirst({
      where: { nameNormalized, source: input.source, company: input.company ?? null },
    });
    if (existing) {
      return this.prisma.person.update({
        where: { id: existing.id },
        data: {
          nameRaw: input.nameRaw,
          title: input.title ?? existing.title,
          linkedinUrl: input.linkedinUrl ?? existing.linkedinUrl,
        },
      });
    }
    return this.prisma.person.create({
      data: {
        nameRaw: input.nameRaw,
        nameNormalized,
        company: input.company ?? null,
        title: input.title ?? null,
        source: input.source,
        linkedinUrl: input.linkedinUrl ?? null,
      },
    });
  }

  /** Parse freeform paste (names one per line or simple CSV) without fabricating structure. */
  parsePasteLines(text: string): Array<{ nameRaw: string; company?: string; title?: string }> {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.replace(/<[^>]+>/g, ' ').trim())
      .filter((l) => l.length >= 3 && !/^name$/i.test(l));
    const out: Array<{ nameRaw: string; company?: string; title?: string }> = [];
    for (const line of lines) {
      const parts = line.split(/[|,\t]/).map((p) => p.trim()).filter(Boolean);
      if (!parts[0]) continue;
      out.push({
        nameRaw: parts[0],
        company: parts[1],
        title: parts[2],
      });
    }
    return out;
  }
}
