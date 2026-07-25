import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LlmService } from '../llm/llm.service';
import { EventbriteClient } from './clients/eventbrite.client';
import { HtmlEventClient } from './clients/html-event.client';
import { IcsFeedClient } from './clients/ics.client';
import type { EventSourceClient } from './clients/event-source.types';
import { EventsService } from './events.service';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class EventSyncService {
  private readonly logger = new Logger(EventSyncService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly llm: LlmService,
    private readonly events: EventsService,
    private readonly prisma: PrismaService,
  ) {}

  buildClients(): EventSourceClient[] {
    const enabled = new Set(
      (this.config.get<string>('eventSourcesEnabled') ?? 'manual,eventbrite,ics')
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    );
    const clients: EventSourceClient[] = [];

    if (enabled.has('eventbrite')) {
      clients.push(
        new EventbriteClient(this.config.get<string>('eventbriteToken') ?? ''),
      );
    }

    if (enabled.has('ics')) {
      const feeds = this.config.get<string>('eventIcsFeeds') ?? '';
      for (const part of feeds.split(',').map((s) => s.trim()).filter(Boolean)) {
        const [sourceId, url] = part.split('|');
        if (sourceId && url) clients.push(new IcsFeedClient(sourceId, url));
      }
    }

    if (enabled.has('postandcourier')) {
      clients.push(
        new HtmlEventClient(
          {
            sourceId: 'postandcourier',
            url:
              this.config.get<string>('postAndCourierEventsUrl') ??
              'https://www.postandcourier.com/greenville/business/real-estate/',
            cityHint: 'Greenville',
          },
          this.llm,
        ),
      );
    }

    if (enabled.has('bisnow')) {
      clients.push(
        new HtmlEventClient(
          {
            sourceId: 'bisnow',
            url:
              this.config.get<string>('bisnowEventsUrl') ??
              'https://www.bisnow.com/events/carolinas',
            cityHint: 'Greenville',
          },
          this.llm,
        ),
      );
    }

    return clients;
  }

  async syncAll(): Promise<{ sources: number; upserted: number }> {
    const syncRun = await this.prisma.syncRun.create({
      data: { source: 'events.syncAll', status: 'running' },
    });
    const from = new Date();
    const to = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    let upserted = 0;
    const clients = this.buildClients();
    try {
      for (const client of clients) {
        this.logger.log(`Syncing events from ${client.sourceId}`);
        const drafts = await client.fetchUpcoming(from, to);
        for (const draft of drafts) {
          await this.events.upsertDraft(draft, client.sourceId);
          upserted += 1;
        }
      }
      await this.prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: 'success',
          finishedAt: new Date(),
          recordsSeen: upserted,
          recordsUpserted: upserted,
        },
      });
      return { sources: clients.length, upserted };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await this.prisma.syncRun.update({
        where: { id: syncRun.id },
        data: {
          status: 'failed',
          finishedAt: new Date(),
          recordsUpserted: upserted,
          error: message,
        },
      });
      throw err;
    }
  }
}
