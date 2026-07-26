import { createFloodClient, FemaNfhlFloodClient, isHighRiskFloodZone } from './flood.client';

describe('flood client', () => {
  it('detects high-risk zones', () => {
    expect(isHighRiskFloodZone('AE')).toBe(true);
    expect(isHighRiskFloodZone('X')).toBe(false);
  });

  it('defaults to FEMA NFHL when no FLOOD_API_URL', () => {
    const client = createFloodClient({});
    expect(client).toBeInstanceOf(FemaNfhlFloodClient);
  });

  it('parses FEMA feature attributes', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(
        JSON.stringify({
          features: [{ attributes: { FLD_ZONE: 'AE', ZONE_SUBTY: null, SFHA_TF: 'T' } }],
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const client = new FemaNfhlFloodClient(undefined, fetchImpl);
    const hit = await client.lookupZone(34.85, -82.4);
    expect(hit?.floodZone).toBe('AE');
    expect(hit?.payload.source).toBe('fema_nfhl');
  });
});
