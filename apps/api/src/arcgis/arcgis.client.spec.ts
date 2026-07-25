import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ArcGisClient } from './arcgis.client';

const fixtures = join(__dirname, '../../test/fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtures, name), 'utf8'));
}

describe('ArcGisClient pagination', () => {
  it('paginates with resultOffset against fixtures (no live calls)', async () => {
    const meta = loadFixture('layer-metadata.json');
    const page0 = loadFixture('parcels-page-0.json');
    const page1 = loadFixture('parcels-page-1.json');

    const calls: string[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      calls.push(url);

      if (url.includes('MapServer/52?f=json') || url.endsWith('/52?f=json')) {
        return new Response(JSON.stringify(meta), { status: 200 });
      }

      if (url.includes('returnCountOnly')) {
        return new Response(JSON.stringify({ count: 4 }), { status: 200 });
      }
      if (url.includes('resultOffset=0')) {
        return new Response(JSON.stringify(page0), { status: 200 });
      }
      if (url.includes('resultOffset=2')) {
        return new Response(JSON.stringify(page1), { status: 200 });
      }
      if (url.includes('resultOffset=4')) {
        return new Response(JSON.stringify({ features: [], exceededTransferLimit: false }), {
          status: 200,
        });
      }

      throw new Error(`Unexpected URL: ${url}`);
    };

    const client = ArcGisClient.create({
      layerUrl: 'https://example.test/MapServer/52',
      pageDelayMs: 0,
      maxConcurrency: 2,
      fetchImpl,
    });

    const pins: string[] = [];
    for await (const attrs of client.iterateFeatures({ where: '1=1', pageSize: 2 })) {
      pins.push(String(attrs.PIN));
    }

    expect(pins).toEqual([
      '0123000100100',
      '0123000100200',
      '0123000100300',
      '0123000100400',
    ]);
    expect(calls.some((u) => u.includes('resultOffset=0'))).toBe(true);
    expect(calls.some((u) => u.includes('resultOffset=2'))).toBe(true);
  });

  it('continues paging when exceededTransferLimit is true on a short page', async () => {
    const meta = loadFixture('layer-metadata.json');
    let offset0Hits = 0;
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (!url.includes('/query')) {
        return new Response(JSON.stringify(meta), { status: 200 });
      }
      if (url.includes('resultOffset=0')) {
        offset0Hits += 1;
        return new Response(
          JSON.stringify({
            features: [
              { attributes: { OBJECTID: 1, PIN: 'A' } },
            ],
            exceededTransferLimit: true,
          }),
          { status: 200 },
        );
      }
      if (url.includes('resultOffset=1')) {
        return new Response(
          JSON.stringify({
            features: [{ attributes: { OBJECTID: 2, PIN: 'B' } }],
            exceededTransferLimit: false,
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify({ features: [] }), { status: 200 });
    };

    const client = ArcGisClient.create({
      layerUrl: 'https://example.test/MapServer/52',
      pageDelayMs: 0,
      fetchImpl,
    });

    const pins: string[] = [];
    for await (const attrs of client.iterateFeatures({ pageSize: 2 })) {
      pins.push(String(attrs.PIN));
    }
    expect(pins).toEqual(['A', 'B']);
    expect(offset0Hits).toBe(1);
  });

  it('retries on 5xx with backoff', async () => {
    let attempts = 0;
    const meta = loadFixture('layer-metadata.json');
    const fetchImpl: typeof fetch = async (input) => {
      const url = String(input);
      if (url.includes('?f=json') && !url.includes('/query')) {
        return new Response(JSON.stringify(meta), { status: 200 });
      }
      attempts += 1;
      if (attempts < 3) {
        return new Response('nope', { status: 503 });
      }
      return new Response(JSON.stringify({ features: [] }), { status: 200 });
    };

    const client = ArcGisClient.create({
      layerUrl: 'https://example.test/MapServer/52',
      pageDelayMs: 0,
      fetchImpl,
    });

    const attrs = [];
    for await (const a of client.iterateFeatures({ pageSize: 2 })) {
      attrs.push(a);
    }
    expect(attrs).toEqual([]);
    expect(attempts).toBe(3);
  });
});