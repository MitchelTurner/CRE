import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type {
  ArcGisClientOptions,
  ArcGisLayerMetadata,
  ArcGisQueryResponse,
} from './arcgis.types';
import { centroidFromGeometry } from './geometry';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

@Injectable()
export class ArcGisClient {
  private readonly logger = new Logger(ArcGisClient.name);
  private readonly layerUrl: string;
  private readonly maxConcurrency: number;
  private readonly pageDelayMs: number;
  private readonly userAgent: string;
  private readonly fetchImpl: typeof fetch;
  private active = 0;
  private readonly waitQueue: Array<() => void> = [];

  constructor(config: ConfigService) {
    this.layerUrl = config.getOrThrow<string>('arcgis.parcelLayerUrl');
    this.maxConcurrency = config.get<number>('arcgis.maxConcurrency') ?? 2;
    this.pageDelayMs = config.get<number>('arcgis.pageDelayMs') ?? 250;
    this.userAgent =
      config.get<string>('arcgis.userAgent') ??
      'GreenvilleCRE-LeadEngine/1.0 (+contact@example.com)';
    this.fetchImpl = fetch;
  }

  /** Test / script helper — bypass Nest DI. */
  static create(options: ArcGisClientOptions): ArcGisClient {
    const client = Object.create(ArcGisClient.prototype) as ArcGisClient;
    (client as unknown as { logger: Logger }).logger = new Logger(ArcGisClient.name);
    (client as unknown as { layerUrl: string }).layerUrl = options.layerUrl;
    (client as unknown as { maxConcurrency: number }).maxConcurrency =
      options.maxConcurrency ?? 2;
    (client as unknown as { pageDelayMs: number }).pageDelayMs = options.pageDelayMs ?? 250;
    (client as unknown as { userAgent: string }).userAgent =
      options.userAgent ?? 'GreenvilleCRE-LeadEngine/1.0 (+contact@example.com)';
    (client as unknown as { fetchImpl: typeof fetch }).fetchImpl = options.fetchImpl ?? fetch;
    (client as unknown as { active: number }).active = 0;
    (client as unknown as { waitQueue: Array<() => void> }).waitQueue = [];
    return client;
  }

  async getLayerMetadata(): Promise<ArcGisLayerMetadata> {
    return this.getJson<ArcGisLayerMetadata>(`${this.layerUrl}?f=json`);
  }

  async query(params: Record<string, string | number | boolean>): Promise<ArcGisQueryResponse> {
    const qs = new URLSearchParams();
    qs.set('f', 'json');
    for (const [k, v] of Object.entries(params)) {
      qs.set(k, String(v));
    }
    return this.getJson<ArcGisQueryResponse>(`${this.layerUrl}/query?${qs.toString()}`);
  }

  /**
   * Full paginated attribute pull. Prefers resultOffset pagination when supported;
   * falls back to OBJECTID-range batching.
   */
  async *iterateFeatures(options?: {
    where?: string;
    outFields?: string;
    pageSize?: number;
    includeGeometry?: boolean;
    onPage?: (info: { offset: number; count: number }) => void;
  }): AsyncGenerator<Record<string, unknown>, void, unknown> {
    const meta = await this.getLayerMetadata();
    const pageSize = Math.min(
      options?.pageSize ?? meta.maxRecordCount,
      meta.maxRecordCount,
    );
    const where = options?.where ?? '1=1';
    const outFields = options?.outFields ?? '*';
    const includeGeometry = options?.includeGeometry !== false;
    const supportsPagination = meta.advancedQueryCapabilities?.supportsPagination === true;

    if (supportsPagination) {
      let offset = 0;
      for (;;) {
        const page = await this.query({
          where,
          outFields,
          returnGeometry: includeGeometry,
          outSR: 4326,
          resultOffset: offset,
          resultRecordCount: pageSize,
          orderByFields: 'OBJECTID',
        });
        const features = page.features ?? [];
        options?.onPage?.({ offset, count: features.length });
        if (features.length === 0) break;
        for (const f of features) {
          yield this.withCentroid(f.attributes, includeGeometry ? f.geometry : undefined);
        }
        // Full page ⇒ possibly more; short page ⇒ done.
        if (features.length < pageSize) break;
        offset += features.length;
        await sleep(this.pageDelayMs);
      }
      return;
    }

    this.logger.warn('Layer does not support pagination; using OBJECTID-range batching');
    const idsResp = await this.query({ where, returnIdsOnly: true });
    const ids = (idsResp.objectIds ?? []).sort((a, b) => a - b);
    for (let i = 0; i < ids.length; i += pageSize) {
      const batch = ids.slice(i, i + pageSize);
      if (batch.length === 0) continue;
      const minId = batch[0]!;
      const maxId = batch[batch.length - 1]!;
      const page = await this.query({
        where: `OBJECTID >= ${minId} AND OBJECTID <= ${maxId} AND (${where})`,
        outFields,
        returnGeometry: includeGeometry,
        outSR: 4326,
        orderByFields: 'OBJECTID',
      });
      const features = page.features ?? [];
      options?.onPage?.({ offset: i, count: features.length });
      for (const f of features) {
        yield this.withCentroid(f.attributes, includeGeometry ? f.geometry : undefined);
      }
      await sleep(this.pageDelayMs);
    }
  }

  private withCentroid(
    attributes: Record<string, unknown>,
    geometry: unknown,
  ): Record<string, unknown> {
    const c = centroidFromGeometry(geometry);
    if (!c) return attributes;
    return {
      ...attributes,
      __latitude: c.latitude,
      __longitude: c.longitude,
    };
  }

  private async acquire(): Promise<void> {
    if (this.active < this.maxConcurrency) {
      this.active += 1;
      return;
    }
    await new Promise<void>((resolve) => this.waitQueue.push(resolve));
    this.active += 1;
  }

  private release(): void {
    this.active -= 1;
    const next = this.waitQueue.shift();
    if (next) next();
  }

  private async getJson<T>(url: string, attempt = 0): Promise<T> {
    await this.acquire();
    try {
      const res = await this.fetchImpl(url, {
        headers: {
          'User-Agent': this.userAgent,
          Accept: 'application/json',
        },
      });

      if (res.status >= 500 && attempt < 5) {
        const backoff = Math.min(8000, 250 * 2 ** attempt);
        this.logger.warn(`ArcGIS 5xx (${res.status}); backoff ${backoff}ms`);
        this.release();
        await sleep(backoff);
        return this.getJson<T>(url, attempt + 1);
      }

      if (!res.ok) {
        throw new Error(`ArcGIS HTTP ${res.status}: ${url}`);
      }

      const data = (await res.json()) as T & { error?: { message: string } };
      if (data && typeof data === 'object' && 'error' in data && data.error) {
        throw new Error(`ArcGIS error: ${data.error.message}`);
      }
      return data;
    } finally {
      this.release();
    }
  }
}