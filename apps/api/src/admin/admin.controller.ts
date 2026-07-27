import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { ApiTokenGuard } from '../auth/api-token.guard';
import { JOBS, QUEUES } from '../jobs/queues';
import { PrismaService } from '../prisma/prisma.service';
import { DigestService } from '../digest/digest.service';
import { FeedbackTuningService } from '../scoring/feedback-tuning.service';
import { CrmSyncService } from '../leads/crm-sync.service';
import { ParcelsSyncService } from '../ingestion/parcels-sync.service';
import { EventsService } from '../events/events.service';
import { InviteListService } from '../host/invite-list.service';
import { MatchingService } from '../events/matching.service';
import { ConfigService } from '@nestjs/config';
import { SignalService } from '../enrichment/signal.service';
import { EnrichmentService } from '../enrichment/enrichment.service';
import { normalizeOwnerName } from '@cre/shared';
import { createRodClient, getRodClientStatus, GovOsRodClient } from '../clients/rod.client';

@Controller('admin')
@UseGuards(ApiTokenGuard)
export class AdminController {
  constructor(
    @InjectQueue(QUEUES.INGESTION) private readonly ingestionQueue: Queue,
    @InjectQueue(QUEUES.ENRICHMENT) private readonly enrichmentQueue: Queue,
    @InjectQueue(QUEUES.DIGEST) private readonly digestQueue: Queue,
    @InjectQueue(QUEUES.EVENTS) private readonly eventsQueue: Queue,
    @InjectQueue(QUEUES.REPORTS) private readonly reportsQueue: Queue,
    private readonly prisma: PrismaService,
    private readonly digest: DigestService,
    private readonly feedbackTuning: FeedbackTuningService,
    private readonly crmSync: CrmSyncService,
    private readonly parcelsSync: ParcelsSyncService,
    private readonly events: EventsService,
    private readonly inviteLists: InviteListService,
    private readonly matching: MatchingService,
    private readonly signals: SignalService,
    private readonly enrichment: EnrichmentService,
    private readonly config: ConfigService,
  ) {}

  @Post('sync')
  async enqueueSync() {
    const job = await this.ingestionQueue.add(
      JOBS.PARCELS_FULL_SYNC,
      { reason: 'manual' },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
    return {
      enqueued: true,
      jobId: job.id,
      jobName: JOBS.PARCELS_FULL_SYNC,
      note: 'Job queued — watch Recent sync runs for success/failed (full county pull can take several minutes).',
    };
  }

  @Post('enrich')
  async enqueueEnrich(@Query('topN') topN?: string) {
    const n = Math.min(Math.max(parseInt(topN ?? '25', 10) || 25, 1), 100);
    const job = await this.enrichmentQueue.add(
      JOBS.ENRICHMENT_PASS,
      { reason: 'manual', topN: n },
      {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
    return {
      enqueued: true,
      jobId: job.id,
      jobName: JOBS.ENRICHMENT_PASS,
      topN: n,
      note: 'Enrichment queued (tax/distress/SoS/ROD/planning/permits/listings/probate/flood/HITL).',
    };
  }

  @Get('rod/status')
  rodStatus() {
    return getRodClientStatus();
  }

  @Post('rod/probe')
  async probeRodLogin() {
    const status = getRodClientStatus();
    if (!status.ready) {
      return { ok: false, ...status, detail: status.reason };
    }
    const client = createRodClient();
    if (!(client instanceof GovOsRodClient)) {
      return { ok: false, ...status, detail: 'ROD client is disabled' };
    }
    const probe = await client.probeLogin();
    return { ...status, ...probe };
  }

  @Post('rod/watch')
  async enqueueRodWatch() {
    const status = getRodClientStatus();
    const job = await this.enrichmentQueue.add(
      JOBS.ROD_WATCH,
      { reason: 'manual' },
      {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
    return {
      enqueued: true,
      jobId: job.id,
      jobName: JOBS.ROD_WATCH,
      rod: status,
      note: status.ready
        ? 'ROD deed/mortgage watcher queued — watch Recent sync runs for rod_watch (login + WebSocket search).'
        : `ROD watcher queued, but it will no-op: ${status.reason}`,
    };
  }

  @Post('tax/sync')
  async enqueueTaxSync() {
    const job = await this.enrichmentQueue.add(
      JOBS.TAX_DELINQUENCY_SYNC,
      { reason: 'manual' },
      {
        attempts: 2,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
    return {
      enqueued: true,
      jobId: job.id,
      jobName: JOBS.TAX_DELINQUENCY_SYNC,
      note: 'Tax delinquency + distress list sync queued.',
    };
  }

  @Post('tune-weights')
  tuneWeights() {
    return this.feedbackTuning.tuneFromFeedback(5);
  }

  @Post('crm/sync')
  syncCrm() {
    return this.crmSync.syncEligible();
  }

  @Get('sync-runs')
  async listSyncRuns(@Query('limit') limit?: number) {
    const take = Math.min(limit ?? 25, 100);
    return this.prisma.syncRun.findMany({
      orderBy: { startedAt: 'desc' },
      take,
    });
  }

  @Get('jobs/active')
  async activeJobs() {
    const running = await this.prisma.syncRun.findMany({
      where: { status: 'running' },
      orderBy: { startedAt: 'desc' },
      take: 10,
    });
    return { items: running };
  }

  @Get('inventory')
  inventory() {
    return this.parcelsSync.inventoryCounts();
  }

  @Post('parcels/reactivate')
  async reactivateParcels() {
    const result = await this.parcelsSync.reactivateAllCommercial();
    return {
      ...result,
      note:
        result.reactivated > 0
          ? `Reactivated ${result.reactivated} commercial parcels. Run a full sync when ready.`
          : 'No inactive commercial parcels to reactivate.',
    };
  }

  @Post('digest/preview')
  previewDigest(@Body() body?: { excludePins?: string[] }) {
    return this.digest.preview(false, { excludePins: body?.excludePins });
  }

  @Post('digest/send')
  async sendDigest(@Body() body?: { excludePins?: string[] }) {
    const job = await this.digestQueue.add(
      JOBS.DIGEST_WEEKLY,
      { reason: 'manual', excludePins: body?.excludePins ?? [] },
      {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
    return {
      enqueued: true,
      jobId: job.id,
      jobName: JOBS.DIGEST_WEEKLY,
      excluded: body?.excludePins?.length ?? 0,
      note: 'Digest queued with your include/exclude selection.',
    };
  }

  /** M4 — enqueue weekly event feed sync */
  @Post('events/sync')
  async syncEvents() {
    const job = await this.eventsQueue.add(
      JOBS.EVENTS_SYNC_ALL,
      { reason: 'manual' },
      {
        attempts: 2,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 50,
        removeOnFail: 50,
      },
    );
    return {
      enqueued: true,
      jobId: job.id,
      jobName: JOBS.EVENTS_SYNC_ALL,
      note:
        'Event sync queued. Seed calendar fills the feed without keys; set EVENTBRITE_TOKEN / EVENT_ICS_FEEDS for live sources. No LinkedIn automation — paste events manually.',
    };
  }

  /**
   * Paste future events (one per line):
   *   Name | ISO-or-local datetime | Venue | Host | URL
   * Lawful copy from public pages / LinkedIn UI only — no LinkedIn automation.
   */
  @Post('events/paste')
  pasteEvents(@Body('text') text: string) {
    return this.events.pasteEvents(text || '');
  }

  /** M4 — manual event entry */
  @Post('events')
  createEvent(
    @Body()
    body: {
      name?: string;
      startsAt?: string;
      endsAt?: string;
      venue?: string;
      city?: string;
      hostOrg?: string;
      url?: string;
      category?: string;
      ownerDensity?: string;
      audience?: string;
      status?: string;
    },
  ) {
    return this.events.createManual({
      name: body.name ?? '',
      startsAt: body.startsAt ?? '',
      endsAt: body.endsAt,
      venue: body.venue,
      city: body.city,
      hostOrg: body.hostOrg,
      url: body.url,
      category: body.category,
      ownerDensity: body.ownerDensity,
      audience: body.audience,
      status: body.status,
    });
  }

  /** M7 — enqueue quarterly report */
  @Post('reports/quarterly')
  async quarterlyReport() {
    const job = await this.reportsQueue.add(
      JOBS.REPORTS_QUARTERLY,
      { reason: 'manual' },
      {
        attempts: 2,
        removeOnComplete: 20,
        removeOnFail: 20,
      },
    );
    return {
      enqueued: true,
      jobId: job.id,
      jobName: JOBS.REPORTS_QUARTERLY,
      note: 'Quarterly market report queued — HTML emailed when DIGEST_RECIPIENTS set.',
    };
  }

  /** M9 — host-mode invite CSV */
  @Post('invite-list')
  buildInviteList(
    @Body()
    body?: {
      minScore?: number;
      landUse?: string;
      ownerType?: 'entity' | 'individual' | 'absentee';
      excludeContactedWithinDays?: number;
      limit?: number;
    },
  ) {
    return this.inviteLists.build(body ?? {});
  }

  @Post('submarkets/assign')
  async assignSubmarkets() {
    const n = await this.enrichment.assignSubmarkets();
    return { assigned: n, note: `Tagged ${n} parcels with submarket boxes.` };
  }

  /**
   * Judgment / divorce / public lien paste (Name[, amount][, case#]).
   * Public court index only — no login scraping.
   */
  @Post('liens/paste')
  async liensPaste(@Body('text') text: string) {
    const lines = this.matching.parsePasteLines(text || '');
    const rows = lines.map((l) => ({
      name: l.nameRaw,
      amount: l.company && /^\d/.test(l.company) ? Number(l.company.replace(/[^\d.]/g, '')) : undefined,
      caseNumber: l.title,
      kind: 'judgment',
    }));
    const n = await this.enrichment.ingestJudgmentLiens(rows);
    return { parsed: rows.length, signalsCreated: n };
  }

  /** Broker roster paste → Person source=broker_directory for event matching. */
  @Post('brokers/paste')
  async brokersPaste(@Body('text') text: string) {
    const rows = this.matching.parsePasteLines(text || '');
    let n = 0;
    let matched = 0;
    for (const row of rows) {
      const person = await this.matching.upsertPerson({
        nameRaw: row.nameRaw,
        company: row.company,
        title: row.title ?? 'broker',
        source: 'broker_directory',
      });
      const hits = await this.matching.matchPerson(person.id);
      if (hits.length) matched += 1;
      n += 1;
    }
    return {
      upserted: n,
      matched,
      note: `Broker directory: ${n} upserted, ${matched} matched to owners.`,
    };
  }

  /**
   * M8 — manual-assist probate paste.
   * Ethics: only paste public probate index rows the agent/VA lawfully obtained.
   * Outreach timing is agent judgment; signals honor PROBATE_LEAD_DELAY_DAYS (default 60).
   */
  @Post('probate/paste')
  async probatePaste(@Body('text') text: string) {
    const rows = this.matching.parsePasteLines(text || '');
    const delayDays = this.config.get<number>('probateLeadDelayDays') ?? 60;
    // Detected now, but digest/outreach visibility delayed via expires/detected window in payload
    const visibleAt = new Date(Date.now() + delayDays * 24 * 60 * 60 * 1000);
    let matched = 0;
    for (const row of rows) {
      const normalized = normalizeOwnerName(row.nameRaw);
      if (normalized.length < 5) continue;
      const owners = await this.prisma.owner.findMany({
        where: {
          OR: [
            { nameNormalized: normalized },
            { nameNormalized: { contains: normalized.slice(0, 24) }, isEntity: false },
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
            type: 'probate_estate',
            payload: {
              decedentName: row.nameRaw,
              company: row.company,
              source: 'paste',
              visibleAt: visibleAt.toISOString(),
              delayDays,
              note: 'Outreach tone/timing is agent judgment — suggest waiting until visibleAt.',
            },
            expiresAt: new Date(Date.now() + 400 * 24 * 60 * 60 * 1000),
          });
          matched += 1;
        }
      }
    }
    return {
      parsed: rows.length,
      signalsCreated: matched,
      delayDays,
      note: `Probate signals created with ${delayDays}-day suggested outreach delay.`,
    };
  }
}
