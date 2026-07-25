import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  assignSubmarket,
  inferMortgageMaturityDates,
  isMaturityWithinMonths,
  normalizeOwnerName,
} from '@cre/shared';
import { createSosClient, isDissolvedStatus, type SosClient } from '../clients/sos.client';
import { createRodClient, type RodClient } from '../clients/rod.client';
import { createSkipTraceClient, type SkipTraceClient } from '../clients/skiptrace.client';
import { createDistressClient, type DistressClient } from '../clients/distress.client';
import { createPlanningClient, type PlanningClient } from '../clients/planning.client';
import { createPermitsClient, type PermitsClient } from '../clients/permits.client';
import { createListingsClient, type ListingsClient } from '../clients/listings.client';
import { createProbateClient, type ProbateClient } from '../clients/probate.client';
import {
  createFloodClient,
  isHighRiskFloodZone,
  type FloodClient,
} from '../clients/flood.client';
import { PrismaService } from '../prisma/prisma.service';
import { HitlService } from './hitl.service';
import { OwnerGraphService } from './owner-graph.service';
import { SignalService } from './signal.service';

@Injectable()
export class EnrichmentService {
  private readonly logger = new Logger(EnrichmentService.name);
  private readonly sos: SosClient;
  private readonly rod: RodClient;
  private readonly skip: SkipTraceClient;
  private readonly distress: DistressClient;
  private readonly planning: PlanningClient;
  private readonly permits: PermitsClient;
  private readonly listings: ListingsClient;
  private readonly probate: ProbateClient;
  private readonly flood: FloodClient;
  private skipTraceUsedThisWeek = 0;
  private skipTraceWeekKey = '';

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly signals: SignalService,
    private readonly ownerGraph: OwnerGraphService,
    private readonly hitl: HitlService,
  ) {
    this.sos = createSosClient(process.env);
    this.rod = createRodClient(process.env);
    this.skip = createSkipTraceClient(process.env);
    this.distress = createDistressClient(process.env);
    this.planning = createPlanningClient(process.env);
    this.permits = createPermitsClient(process.env);
    this.listings = createListingsClient(process.env);
    this.probate = createProbateClient(process.env);
    this.flood = createFloodClient(process.env);
  }

  /** Derive tax_delinquent signals for all active commercial parcels from PAIDDATE. */
  async refreshTaxSignalsFromParcels(): Promise<number> {
    const parcels = await this.prisma.parcel.findMany({
      where: {
        isActive: true,
        isCommercial: true,
        totalTax: { gt: 0 },
        paidDate: null,
      },
      select: { id: true, pin: true, totalTax: true },
    });

    let n = 0;
    for (const p of parcels) {
      const totalTax = p.totalTax ?? 0;
      // Without a paid history, approximate severity years from tax band.
      const yearsDelinquent =
        totalTax >= 50_000 ? 3 : totalTax >= 15_000 ? 2 : totalTax >= 5_000 ? 1 : 0;
      await this.signals.upsertSignal({
        parcelId: p.id,
        type: 'tax_delinquent',
        payload: {
          pin: p.pin,
          totalTax,
          yearsDelinquent,
          amount: totalTax,
          reason: 'paidDate_null_with_tax_due',
          severity:
            totalTax >= 50_000 ? 'high' : totalTax >= 15_000 ? 'medium' : 'low',
        },
      });
      n += 1;
    }
    this.logger.log(`Tax-delinquent signals upserted: ${n}`);
    return n;
  }

  async refreshDistressLists(): Promise<{ taxSale: number; foreclosure: number }> {
    const [taxSale, foreclosure] = await Promise.all([
      this.distress.fetchTaxSaleList(),
      this.distress.fetchForeclosureRoster(),
    ]);

    let taxSaleCount = 0;
    for (const hit of taxSale) {
      if (!hit.pin) continue;
      const parcel = await this.prisma.parcel.findUnique({ where: { pin: hit.pin } });
      if (!parcel) continue;
      await this.signals.upsertSignal({
        parcelId: parcel.id,
        type: 'tax_sale',
        payload: hit.payload,
      });
      taxSaleCount += 1;
    }

    let fcCount = 0;
    for (const hit of foreclosure) {
      if (!hit.pin) continue;
      const parcel = await this.prisma.parcel.findUnique({ where: { pin: hit.pin } });
      if (!parcel) continue;
      await this.signals.upsertSignal({
        parcelId: parcel.id,
        type: 'foreclosure',
        payload: hit.payload,
        expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      });
      fcCount += 1;
    }

    return { taxSale: taxSaleCount, foreclosure: fcCount };
  }

  async enrichTopLeads(limit = 25): Promise<{
    sos: number;
    mortgages: number;
    skipTrace: number;
  }> {
    const scored = await this.prisma.parcel.findMany({
      where: { isActive: true, isCommercial: true },
      include: {
        owner: true,
        scores: { orderBy: { scoredAt: 'desc' }, take: 1 },
      },
    });
    scored.sort((a, b) => (b.scores[0]?.total ?? 0) - (a.scores[0]?.total ?? 0));
    const targets = scored.slice(0, limit);

    let sos = 0;
    let mortgages = 0;
    let skipTrace = 0;

    for (const parcel of targets) {
      const owner = parcel.owner;
      if (!owner) continue;

      if (owner.isEntity) {
        const stale =
          !owner.sosFetchedAt ||
          Date.now() - owner.sosFetchedAt.getTime() > 30 * 24 * 60 * 60 * 1000;
        if (stale) {
          try {
            const entity = await this.sos.resolveEntity(owner.nameRaw);
            if (entity) {
              await this.prisma.owner.update({
                where: { id: owner.id },
                data: {
                  sosEntityId: entity.entityId ?? null,
                  sosStatus: entity.status ?? null,
                  sosRegisteredAgent: entity.registeredAgent ?? null,
                  sosAgentAddress: entity.agentAddress ?? null,
                  sosFetchedAt: new Date(),
                  sosRaw: entity.raw as Prisma.InputJsonValue,
                },
              });

              if (entity.registeredAgent) {
                await this.prisma.contact.create({
                  data: {
                    ownerId: owner.id,
                    name: entity.registeredAgent,
                    role: 'registered_agent',
                    source: 'sos',
                  },
                });
              }

              for (const member of entity.members ?? []) {
                const exists = await this.prisma.contact.findFirst({
                  where: {
                    ownerId: owner.id,
                    name: member,
                    role: { in: ['officer', 'manager', 'member'] },
                  },
                });
                if (!exists) {
                  await this.prisma.contact.create({
                    data: {
                      ownerId: owner.id,
                      name: member,
                      role: 'officer',
                      source: 'sos',
                    },
                  });
                }
              }

              await this.signals.upsertSignal({
                parcelId: parcel.id,
                type: isDissolvedStatus(entity.status) ? 'sos_dissolved' : 'sos_resolved',
                payload: {
                  legalName: entity.legalName,
                  status: entity.status,
                  registeredAgent: entity.registeredAgent,
                  agentAddress: entity.agentAddress,
                  principalAddress: entity.principalAddress,
                  members: entity.members ?? [],
                  source: entity.source,
                },
              });
              sos += 1;
            }
          } catch (err) {
            this.logger.warn(
              `SoS resolve failed for ${owner.nameRaw}: ${err instanceof Error ? err.message : String(err)}`,
            );
          }
          await sleep(400);
        }
      }

      try {
        const mtg = await this.rod.findLatestMortgage(owner.nameRaw, parcel.pin);
        if (mtg) {
          const maturities = inferMortgageMaturityDates(mtg.originationDate);
          const soon = maturities.find((m) => isMaturityWithinMonths(m, 18));
          if (soon) {
            await this.signals.upsertSignal({
              parcelId: parcel.id,
              type: 'mortgage_maturity',
              payload: {
                originationDate: mtg.originationDate.toISOString(),
                inferredMaturity: soon.toISOString(),
                inferredMaturities: maturities.map((m) => m.toISOString()),
                mortgagee: mtg.mortgagee,
                mortgagor: mtg.mortgagor,
                lender: mtg.mortgagee,
                amount: mtg.amount ?? null,
                loanAmount: mtg.amount ?? null,
                book: mtg.book,
                page: mtg.page,
              },
              expiresAt: soon,
            });
            mortgages += 1;
          }
        }
      } catch (err) {
        this.logger.warn(
          `ROD mortgage lookup failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }

      if (this.canSkipTrace() && (owner.sosRegisteredAgent || owner.isAbsentee)) {
        const name = owner.sosRegisteredAgent || owner.nameRaw;
        try {
          const hit = await this.skip.lookup({
            name,
            mailingAddress: owner.sosAgentAddress || owner.mailingAddress,
          });
          this.bumpSkipTrace();
          if (hit && (hit.phone || hit.email)) {
            await this.prisma.contact.create({
              data: {
                ownerId: owner.id,
                name: hit.name ?? name,
                role: owner.sosRegisteredAgent ? 'registered_agent' : 'owner',
                phone: hit.phone ?? null,
                email: hit.email ?? null,
                source: 'skiptrace',
              },
            });
            skipTrace += 1;
          }
        } catch (err) {
          this.logger.warn(
            `Skip-trace failed: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
        await sleep(300);
      }
    }

    return { sos, mortgages, skipTrace };
  }

  async monitorRecentDeeds(): Promise<number> {
    const since = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    const deeds = await this.rod.searchRecentDeeds(since);
    let n = 0;
    for (const deed of deeds) {
      if (deed.pin) {
        const parcel = await this.prisma.parcel.findUnique({ where: { pin: deed.pin } });
        if (parcel) {
          const buyerType = classifyBuyerType(deed.grantee);
          const salePrice = parcel.salePrice ?? null;
          await this.signals.upsertSignal({
            parcelId: parcel.id,
            type: 'recent_seller',
            payload: {
              grantor: deed.grantor,
              grantee: deed.grantee,
              recordedAt: deed.recordedAt.toISOString(),
              book: deed.book,
              page: deed.page,
              buyerType,
              salePrice,
            },
            expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
          });
          await this.signals.upsertSignal({
            parcelId: parcel.id,
            type: 'deed_comp',
            payload: {
              grantor: deed.grantor,
              grantee: deed.grantee,
              recordedAt: deed.recordedAt.toISOString(),
              buyerType,
              salePrice,
              fairMarketVal: parcel.fairMarketVal,
              book: deed.book,
              page: deed.page,
            },
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          });
          const existingComp = await this.prisma.saleComp.findFirst({
            where: {
              pin: parcel.pin,
              recordedAt: deed.recordedAt,
              ...(deed.book ? { book: deed.book } : {}),
              ...(deed.page ? { page: deed.page } : {}),
            },
          });
          if (!existingComp) {
            await this.prisma.saleComp.create({
              data: {
                parcelId: parcel.id,
                pin: parcel.pin,
                recordedAt: deed.recordedAt,
                grantor: deed.grantor,
                grantee: deed.grantee,
                salePrice,
                buyerType,
                book: deed.book ?? null,
                page: deed.page ?? null,
                raw: deed as unknown as Prisma.InputJsonValue,
              },
            });
          }
          n += 1;
        }
      }

      if (deed.grantor) {
        const normalized = deed.grantor
          .toUpperCase()
          .replace(/[^\w\s]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .slice(0, 40);
        if (!normalized) continue;

        const owners = await this.prisma.owner.findMany({
          where: { nameNormalized: { contains: normalized } },
          include: {
            parcels: { where: { isActive: true, isCommercial: true }, take: 5 },
          },
          take: 3,
        });
        for (const owner of owners) {
          for (const parcel of owner.parcels) {
            await this.signals.upsertSignal({
              parcelId: parcel.id,
              type: 'recent_seller',
              payload: {
                grantor: deed.grantor,
                grantee: deed.grantee,
                recordedAt: deed.recordedAt.toISOString(),
                matchedBy: 'owner_name',
              },
              expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
            });
            const exists = await this.prisma.lead.findFirst({
              where: {
                parcelId: parcel.id,
                leadType: 'exchange_buyer',
                status: { not: 'dead' },
              },
            });
            if (!exists) {
              await this.prisma.lead.create({
                data: {
                  parcelId: parcel.id,
                  status: 'new',
                  leadType: 'exchange_buyer',
                  whyNow: `Owner ${deed.grantor} recorded a commercial deed on ${deed.recordedAt.toLocaleDateString('en-US')} — possible 1031 replacement buyer (180-day clock).`,
                },
              });
            }
            n += 1;
          }
        }
      }
    }
    return n;
  }

  async refreshPlanningSignals(): Promise<number> {
    const hits = await this.planning.fetchRecentRezones();
    let n = 0;
    for (const hit of hits) {
      let parcelId: string | undefined;
      if (hit.pin) {
        parcelId = (await this.prisma.parcel.findUnique({ where: { pin: hit.pin } }))?.id;
      } else if (hit.address) {
        const match = await this.prisma.parcel.findFirst({
          where: {
            isActive: true,
            isCommercial: true,
            situsAddress: { contains: hit.address.slice(0, 24), mode: 'insensitive' },
          },
        });
        parcelId = match?.id;
      }
      if (!parcelId) continue;
      await this.signals.upsertSignal({
        parcelId,
        type: 'zoning_change',
        payload: hit.payload,
        expiresAt: new Date(Date.now() + 120 * 24 * 60 * 60 * 1000),
      });
      n += 1;
    }
    return n;
  }

  async refreshPermitSignals(): Promise<number> {
    const since = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const hits = await this.permits.fetchRecentCommercialPermits(since);
    let n = 0;
    for (const hit of hits) {
      let parcel =
        (hit.pin && (await this.prisma.parcel.findUnique({ where: { pin: hit.pin } }))) ||
        null;
      if (!parcel && hit.address) {
        parcel = await this.prisma.parcel.findFirst({
          where: {
            isActive: true,
            isCommercial: true,
            situsAddress: { contains: hit.address.slice(0, 24), mode: 'insensitive' },
          },
        });
      }
      if (!parcel) continue;
      await this.signals.upsertSignal({
        parcelId: parcel.id,
        type: 'permit_activity',
        payload: hit.payload,
        expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
      });
      const blob = JSON.stringify(hit.payload ?? {}).toLowerCase();
      if (/(vacant|vacancy|demo(?:lition)?|tenant improv|ti\b|lease.?up|shell)/i.test(blob)) {
        await this.signals.upsertSignal({
          parcelId: parcel.id,
          type: 'vacancy_proxy',
          payload: {
            ...(typeof hit.payload === 'object' && hit.payload ? hit.payload : {}),
            reason: 'permit_vacancy_keywords',
            match: 'permit',
          },
          expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000),
        });
      }
      n += 1;
    }
    return n;
  }

  async refreshListingSignals(radiusMiles = 0.5): Promise<number> {
    const listings = await this.listings.fetchActiveListings();
    if (!listings.length) return 0;

    const parcels = await this.prisma.parcel.findMany({
      where: {
        isActive: true,
        isCommercial: true,
        latitude: { not: null },
        longitude: { not: null },
      },
      select: { id: true, pin: true, latitude: true, longitude: true },
    });

    let n = 0;
    for (const listing of listings) {
      if (listing.pin) {
        const exact = parcels.find((p) => p.pin === listing.pin);
        if (exact) {
          await this.signals.upsertSignal({
            parcelId: exact.id,
            type: 'nearby_listing',
            payload: { ...listing.payload, match: 'pin' },
            expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          });
          // Same-PIN active listing ≈ vacancy / lease-roll proxy for that asset.
          await this.signals.upsertSignal({
            parcelId: exact.id,
            type: 'vacancy_proxy',
            payload: {
              ...listing.payload,
              match: 'pin',
              reason: 'active_listing_on_parcel',
            },
            expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          });
          n += 1;
          continue;
        }
      }
      if (listing.latitude == null || listing.longitude == null) continue;
      for (const p of parcels) {
        if (p.latitude == null || p.longitude == null) continue;
        const miles = haversineMiles(listing.latitude, listing.longitude, p.latitude, p.longitude);
        if (miles <= radiusMiles) {
          await this.signals.upsertSignal({
            parcelId: p.id,
            type: 'nearby_listing',
            payload: { ...listing.payload, miles: Number(miles.toFixed(2)) },
            expiresAt: new Date(Date.now() + 60 * 24 * 60 * 60 * 1000),
          });
          n += 1;
        }
      }
    }
    return n;
  }

  async refreshProbateSignals(): Promise<number> {
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const hits = await this.probate.fetchRecentEstates(since);
    let n = 0;
    for (const hit of hits) {
      if (hit.pin) {
        const parcel = await this.prisma.parcel.findUnique({ where: { pin: hit.pin } });
        if (parcel) {
          await this.signals.upsertSignal({
            parcelId: parcel.id,
            type: 'probate_estate',
            payload: hit.payload,
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          });
          n += 1;
          continue;
        }
      }
      if (!hit.decedentName) continue;
      const normalized = normalizeOwnerName(hit.decedentName);
      if (normalized.length < 5) continue;
      const owners = await this.prisma.owner.findMany({
        where: { nameNormalized: { contains: normalized.slice(0, 24) }, isEntity: false },
        include: { parcels: { where: { isActive: true, isCommercial: true }, take: 3 } },
        take: 3,
      });
      for (const owner of owners) {
        for (const parcel of owner.parcels) {
          await this.signals.upsertSignal({
            parcelId: parcel.id,
            type: 'probate_estate',
            payload: { ...hit.payload, matchedOwner: owner.nameRaw },
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          });
          n += 1;
        }
      }
    }
    return n;
  }

  async refreshFloodForTopLeads(limit = 25): Promise<number> {
    const parcels = await this.prisma.parcel.findMany({
      where: {
        isActive: true,
        isCommercial: true,
        latitude: { not: null },
        longitude: { not: null },
      },
      include: { scores: { orderBy: { scoredAt: 'desc' }, take: 1 } },
    });
    parcels.sort((a, b) => (b.scores[0]?.total ?? 0) - (a.scores[0]?.total ?? 0));
    let n = 0;
    for (const parcel of parcels.slice(0, limit)) {
      if (parcel.latitude == null || parcel.longitude == null) continue;
      const hit = await this.flood.lookupZone(parcel.latitude, parcel.longitude);
      if (!hit) continue;
      await this.prisma.parcel.update({
        where: { id: parcel.id },
        data: { floodZone: hit.floodZone },
      });
      if (isHighRiskFloodZone(hit.floodZone)) {
        await this.signals.upsertSignal({
          parcelId: parcel.id,
          type: 'flood_zone',
          payload: hit.payload,
        });
        n += 1;
      }
      await sleep(150);
    }
    return n;
  }

  /** Tag parcels with Greenville submarket from lat/lon boxes. */
  async assignSubmarkets(): Promise<number> {
    const parcels = await this.prisma.parcel.findMany({
      where: {
        isActive: true,
        isCommercial: true,
        latitude: { not: null },
        longitude: { not: null },
      },
      select: { id: true, latitude: true, longitude: true },
    });
    let n = 0;
    for (const p of parcels) {
      const sub = assignSubmarket(p.latitude, p.longitude);
      if (!sub) continue;
      await this.prisma.parcel.update({
        where: { id: p.id },
        data: { submarket: sub },
      });
      n += 1;
    }
    this.logger.log(`Submarkets assigned: ${n}`);
    return n;
  }

  /**
   * Judgment / divorce / public liens — paste or future scraper.
   * Ethics: only public court index rows the agent lawfully obtained.
   */
  async ingestJudgmentLiens(
    rows: Array<{ name: string; amount?: number; caseNumber?: string; kind?: string }>,
  ): Promise<number> {
    let n = 0;
    for (const row of rows) {
      const normalized = normalizeOwnerName(row.name);
      if (normalized.length < 5) continue;
      const owners = await this.prisma.owner.findMany({
        where: {
          OR: [
            { nameNormalized: normalized },
            { nameNormalized: { contains: normalized.slice(0, 24) } },
          ],
        },
        include: {
          parcels: { where: { isActive: true, isCommercial: true }, take: 5 },
        },
        take: 3,
      });
      for (const owner of owners) {
        for (const parcel of owner.parcels) {
          await this.signals.upsertSignal({
            parcelId: parcel.id,
            type: 'judgment_lien',
            payload: {
              partyName: row.name,
              amount: row.amount ?? null,
              caseNumber: row.caseNumber ?? null,
              kind: row.kind ?? 'judgment',
              matchedOwner: owner.nameRaw,
              source: 'paste',
            },
            expiresAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          });
          n += 1;
        }
      }
    }
    return n;
  }

  async runFullEnrichmentPass(topN = 25): Promise<Record<string, number>> {
    const syncRun = await this.prisma.syncRun.create({
      data: { source: 'enrichment_pass', status: 'running' },
    });
    try {
      const tax = await this.refreshTaxSignalsFromParcels();
      const distress = await this.refreshDistressLists();
      const deeds = await this.monitorRecentDeeds();
      const zoning = await this.refreshPlanningSignals();
      const permits = await this.refreshPermitSignals();
      const listings = await this.refreshListingSignals();
      const probate = await this.refreshProbateSignals();
      const graph = await this.ownerGraph.rebuildClusters();
      const submarkets = await this.assignSubmarkets();
      const top = await this.enrichTopLeads(topN);
      const flood = await this.refreshFloodForTopLeads(topN);
      const hitl = await this.hitl.refreshQueue(topN);
      const totals = {
        taxSignals: tax,
        taxSale: distress.taxSale,
        foreclosure: distress.foreclosure,
        recentDeeds: deeds,
        zoning,
        permits,
        listings,
        probate,
        ownerGraph: graph.signals,
        submarkets,
        sos: top.sos,
        mortgages: top.mortgages,
        skipTrace: top.skipTrace,
        flood,
        hitlQueued: hitl,
      };
      await this.prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: 'success',
          finishedAt: new Date(),
          recordsSeen: topN,
          recordsUpserted: Object.values(totals).reduce((a, b) => a + b, 0),
        },
      });
      this.logger.log(`Enrichment pass complete: ${JSON.stringify(totals)}`);
      return totals;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.syncRun.update({
        where: { id: syncRun.id },
        data: { status: 'failed', finishedAt: new Date(), error: message },
      });
      throw err;
    }
  }

  private canSkipTrace(): boolean {
    const cap = this.config.get<number>('skiptraceWeeklyCap') ?? 25;
    this.ensureSkipWeek();
    return this.skipTraceUsedThisWeek < cap;
  }

  private bumpSkipTrace(): void {
    this.ensureSkipWeek();
    this.skipTraceUsedThisWeek += 1;
  }

  private ensureSkipWeek(): void {
    const key = weekKey(new Date());
    if (key !== this.skipTraceWeekKey) {
      this.skipTraceWeekKey = key;
      this.skipTraceUsedThisWeek = 0;
    }
  }
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function weekKey(d: Date): string {
  const tmp = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = tmp.getUTCDay() || 7;
  tmp.setUTCDate(tmp.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(tmp.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((tmp.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${tmp.getUTCFullYear()}-W${week}`;
}

function haversineMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const R = 3958.8;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function classifyBuyerType(grantee: string | null | undefined): string {
  if (!grantee?.trim()) return 'unknown';
  const g = grantee.toUpperCase();
  if (/\b(LLC|INC|LP|LLP|CORP|TRUST|HOLDINGS|PARTNERS)\b/.test(g)) return 'entity';
  // Crude OOS heuristic — mailing not available on deed row; flag known foreign patterns later.
  if (/\b(NY|NJ|CA|FL|TX|DE)\b/.test(g)) return 'out_of_state';
  return 'local_or_unknown';
}
