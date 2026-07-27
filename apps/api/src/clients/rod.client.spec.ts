import { EventEmitter } from 'events';
import {
  createRodClient,
  DisabledRodClient,
  getRodClientStatus,
  GovOsRodClient,
} from './rod.client';

describe('getRodClientStatus / createRodClient', () => {
  it('treats True/1 as enabled (Railway-friendly)', () => {
    for (const flag of ['true', 'True', 'TRUE', '1', 'yes']) {
      const status = getRodClientStatus({
        ROD_SCRAPER_ENABLED: flag,
        ROD_EMAIL: 'agent@example.com',
        ROD_PASSWORD: 'secret',
      });
      expect(status.ready).toBe(true);
      expect(
        createRodClient({
          ROD_SCRAPER_ENABLED: flag,
          ROD_EMAIL: 'agent@example.com',
          ROD_PASSWORD: 'secret',
        }),
      ).not.toBeInstanceOf(DisabledRodClient);
    }
  });

  it('reports missing flag clearly', () => {
    const status = getRodClientStatus({
      ROD_EMAIL: 'agent@example.com',
      ROD_PASSWORD: 'secret',
    });
    expect(status.ready).toBe(false);
    expect(status.enabled).toBe(false);
    expect(status.reason).toMatch(/ROD_SCRAPER_ENABLED/);
    expect(
      createRodClient({
        ROD_EMAIL: 'agent@example.com',
        ROD_PASSWORD: 'secret',
      }),
    ).toBeInstanceOf(DisabledRodClient);
  });

  it('reports missing credentials when enabled', () => {
    const status = getRodClientStatus({ ROD_SCRAPER_ENABLED: 'true' });
    expect(status.ready).toBe(false);
    expect(status.enabled).toBe(true);
    expect(status.credentialsPresent).toBe(false);
    expect(status.reason).toMatch(/ROD_EMAIL/);
  });
});

describe('GovOsRodClient login + websocket search', () => {
  it('logs in via form POST and maps WebSocket deed results', async () => {
    const fetchImpl = jest.fn(async (url: string, init?: RequestInit) => {
      const u = String(url);
      if (u.endsWith('/signin') && (!init || init.method === 'GET' || !init.method)) {
        return new Response('<html>signin</html>', {
          status: 200,
          headers: {
            'set-cookie': 'authToken=anon-token; Path=/',
          },
        });
      }
      if (u.endsWith('/signin') && init?.method === 'POST') {
        return new Response('<html>ok</html>', {
          status: 200,
          headers: {
            'set-cookie': [
              'authToken=session-token; Path=/',
              'authToken.sig=sig; Path=/',
            ] as unknown as string,
          },
        });
      }
      return new Response('not found', { status: 404 });
    });

    // Headers.getSetCookie polyfill for Node Response used above
    const originalFetch = fetchImpl as unknown as typeof fetch;

    class FakeWs extends EventEmitter {
      static instances: FakeWs[] = [];
      readyState = 1;
      constructor(
        public url: string,
        public opts?: { headers?: Record<string, string> },
      ) {
        super();
        FakeWs.instances.push(this);
        queueMicrotask(() => this.emit('open'));
      }
      send(data: string) {
        const msg = JSON.parse(data) as { type: string };
        if (msg.type === 'PING') {
          queueMicrotask(() =>
            this.emit('message', Buffer.from(JSON.stringify({ type: 'PONG' }))),
          );
          return;
        }
        if (msg.type === '@kofile/FETCH_DOCUMENTS/v4') {
          queueMicrotask(() =>
            this.emit(
              'message',
              Buffer.from(
                JSON.stringify({
                  type: '@kofile/FETCH_DOCUMENTS_FULFILLED/v6',
                  payload: {
                    data: {
                      byOrder: [1],
                      byHash: {
                        1: {
                          docType: 'DEED',
                          recordedDate: '7/20/2026',
                          grantor: ['ACME HOLDINGS LLC'],
                          grantee: ['BUYER LLC'],
                          bookVolumePage: '1234/55/10',
                          instrumentNumber: '2026000999',
                        },
                      },
                    },
                  },
                }),
              ),
            ),
          );
        }
      }
      close() {
        this.emit('close');
      }
    }

    // Patch Response headers.getSetCookie for login response cookies array case
    const client = new GovOsRodClient({
      baseUrl: 'https://greenville.sc.publicsearch.us',
      email: 'agent@example.com',
      password: 'secret',
      department: 'RP',
      minDelayMs: 0,
      fetchImpl: async (input, init) => {
        const res = await originalFetch(String(input), init);
        const setCookie = res.headers.get('set-cookie');
        if (setCookie && !('getSetCookie' in res.headers)) {
          Object.defineProperty(res.headers, 'getSetCookie', {
            value: () => [setCookie],
          });
        }
        // For POST login simulate multi set-cookie via getSetCookie
        if (String(input).endsWith('/signin') && init?.method === 'POST') {
          Object.defineProperty(res.headers, 'getSetCookie', {
            value: () => [
              'authToken=session-token; Path=/',
              'authToken.sig=sig; Path=/',
            ],
          });
        }
        return res;
      },
      WebSocketImpl: FakeWs as unknown as typeof import('ws'),
    });

    const deeds = await client.searchRecentDeeds(new Date('2026-07-18T00:00:00Z'));
    expect(deeds).toHaveLength(1);
    const deed = deeds[0]!;
    expect(deed.grantor).toBe('ACME HOLDINGS LLC');
    expect(deed.grantee).toBe('BUYER LLC');
    expect(deed.book).toBe('1234');
    expect(deed.page).toBe('10');
    expect(FakeWs.instances.length).toBeGreaterThan(0);
  });

  it('throws on invalid credentials', async () => {
    const client = new GovOsRodClient({
      baseUrl: 'https://greenville.sc.publicsearch.us',
      email: 'bad@example.com',
      password: 'wrong',
      minDelayMs: 0,
      fetchImpl: async () =>
        new Response('<p class="Message message-is-error">Invalid credentials. Please try again.</p>', {
          status: 401,
          headers: { 'set-cookie': 'authToken=x; Path=/' },
        }),
    });
    await expect(client.probeLogin()).resolves.toMatchObject({ ok: false });
  });
});
