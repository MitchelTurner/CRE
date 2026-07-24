import { ConfigService } from '@nestjs/config';
import { DEFAULT_FIELD_MAP } from '@cre/shared';
import { ParcelsSyncService } from './parcels-sync.service';
import { ArcGisClient } from '../arcgis/arcgis.client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const fixtures = join(__dirname, '../../test/fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtures, name), 'utf8'));
}

describe('ParcelsSyncService (fixture server)', () => {
  it('upserts parcels/owners and is idempotent across two runs', async () => {
    const owners = new Map<string, Record<string, unknown>>();
    const parcels = new Map<string, Record<string, unknown>>();
    let syncRuns = 0;

    const prisma = {
      syncRun: {
        create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => {
          syncRuns += 1;
          return { id: `run-${syncRuns}`, ...data };
        }),
        update: jest.fn(async ({ data }: { data: Record<string, unknown> }) => data),
      },
      owner: {
        upsert: jest.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { nameNormalized_mailingAddress: { nameNormalized: string; mailingAddress: string } };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            const key = `${where.nameNormalized_mailingAddress.nameNormalized}|${where.nameNormalized_mailingAddress.mailingAddress}`;
            const existing = owners.get(key);
            if (existing) {
              const merged = { ...existing, ...update };
              owners.set(key, merged);
              return merged;
            }
            const created = { id: `owner-${owners.size + 1}`, ...create };
            owners.set(key, created);
            return created;
          },
        ),
      },
      parcel: {
        upsert: jest.fn(
          async ({
            where,
            create,
            update,
          }: {
            where: { pin: string };
            create: Record<string, unknown>;
            update: Record<string, unknown>;
          }) => {
            const existing = parcels.get(where.pin);
            if (existing) {
              const merged = { ...existing, ...update };
              parcels.set(where.pin, merged);
              return merged;
            }
            const created = { id: `parcel-${parcels.size + 1}`, ...create };
            parcels.set(where.pin, created);
            return created;
          },
        ),
        updateMany: jest.fn(async () => ({ count: 0 })),
      },
    };

    const appConfig = {
      getFieldMap: async () => DEFAULT_FIELD_MAP,
      getCommercialLandUseCodes: async () => ['421', '940', '110', '520'],
      getCommercialPropTypes: async () => ['COMMERCIAL', 'INDUSTRIAL', 'MULTI-FAMILY'],
    };

    const config = {
      get: (key: string) => (key === 'countyHomeState' ? 'SC' : undefined),
    } as unknown as ConfigService;

    const meta = loadFixture('layer-metadata.json');
    const page0 = loadFixture('parcels-page-0.json');
    const page1 = loadFixture('parcels-page-1.json');

    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (!url.includes('/query')) {
        return new Response(JSON.stringify(meta), { status: 200 });
      }
      if (url.includes('resultOffset=0')) {
        return new Response(JSON.stringify(page0), { status: 200 });
      }
      if (url.includes('resultOffset=2')) {
        return new Response(JSON.stringify(page1), { status: 200 });
      }
      return new Response(JSON.stringify({ features: [] }), { status: 200 });
    };

    const arcgis = ArcGisClient.create({
      layerUrl: 'https://example.test/MapServer/52',
      pageDelayMs: 0,
      fetchImpl,
    });

    const service = new ParcelsSyncService(
      prisma as never,
      arcgis,
      appConfig as never,
      config,
    );

    const first = await service.runFullSync();
    expect(first.status).toBe('success');
    expect(first.recordsUpserted).toBe(4);
    expect(parcels.size).toBe(4);
    // ACME owns 3 parcels at same mailing → 1 owner + Jane = 2
    expect(owners.size).toBe(2);

    const snapshot = {
      parcels: [...parcels.entries()],
      owners: [...owners.entries()],
    };

    const second = await service.runFullSync();
    expect(second.status).toBe('success');
    expect(second.recordsUpserted).toBe(4);
    expect([...parcels.entries()]).toEqual(snapshot.parcels);
    expect([...owners.entries()]).toEqual(snapshot.owners);
  });
});