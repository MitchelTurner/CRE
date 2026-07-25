import {
  isDissolvedStatus,
  createSosClient,
  OpenSosDataClient,
  extractMembers,
} from './sos.client';

describe('extractMembers', () => {
  it('pulls string and object officer shapes', () => {
    expect(
      extractMembers({
        officers: [{ name: 'Jane Doe' }, { full_name: 'John Smith' }],
        managers: ['Alex Manager'],
        members: [{ officer_name: 'Pat Member' }, ''],
      }),
    ).toEqual(['Pat Member', 'Jane Doe', 'John Smith', 'Alex Manager']);
  });

  it('dedupes and caps at 20', () => {
    const many = Array.from({ length: 25 }, (_, i) => `Person ${i}`);
    const out = extractMembers({ officers: [...many, 'Person 0'] });
    expect(out).toHaveLength(20);
    expect(out[0]).toBe('Person 0');
  });
});

describe('isDissolvedStatus', () => {
  it.each(['Dissolved', 'Forfeited', 'Inactive', 'Revoked', 'Cancelled'])(
    'detects %s',
    (status) => {
      expect(isDissolvedStatus(status)).toBe(true);
    },
  );

  it('returns false for good standing', () => {
    expect(isDissolvedStatus('Good Standing')).toBe(false);
    expect(isDissolvedStatus(null)).toBe(false);
  });
});

describe('createSosClient', () => {
  it('returns stub without API key', () => {
    const client = createSosClient({});
    return expect(client.resolveEntity('ACME LLC')).resolves.toBeNull();
  });

  it('maps OpenSosData response', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(
        JSON.stringify({
          entity_name: 'ACME HOLDINGS LLC',
          entity_id: '123',
          status: 'Good Standing',
          registered_agent: 'Jane Agent',
          agent_address: '1 Main St',
        }),
        { status: 200 },
      ),
    ) as unknown as typeof fetch;

    const client = new OpenSosDataClient('key', 'https://example.test/v1', fetchImpl);
    const result = await client.resolveEntity('ACME HOLDINGS LLC');
    expect(result?.legalName).toBe('ACME HOLDINGS LLC');
    expect(result?.registeredAgent).toBe('Jane Agent');
    expect(result?.source).toBe('opensosdata');
  });
});
