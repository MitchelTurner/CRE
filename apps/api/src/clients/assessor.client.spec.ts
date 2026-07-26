import { buildAssessorUrl, createAssessorClient, HttpAssessorClient } from './assessor.client';

describe('assessor client', () => {
  it('builds MapNo deep link', () => {
    expect(
      buildAssessorUrl('https://www.greenvillecounty.org/appsas400/RealProperty/', '123'),
    ).toContain('MapNo=123');
  });

  it('returns link_only when HTML is a form shell', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response('<html><body>__doPostBack Search for Real Property</body></html>', {
        status: 200,
      }),
    ) as unknown as typeof fetch;
    const client = new HttpAssessorClient(
      'https://www.greenvillecounty.org/appsas400/RealProperty/',
      fetchImpl,
    );
    const hit = await client.lookupByPin('999');
    expect(hit.scraped).toBe(false);
    expect(hit.publicUrl).toContain('MapNo=999');
  });

  it('parses owner/tax when present', async () => {
    const fetchImpl = jest.fn(async () =>
      new Response(
        '<html><body>Owner Name: ACME HOLDINGS LLC Fair Market Value: $1,250,000 Total Tax: $18,400</body></html>',
        { status: 200 },
      ),
    ) as unknown as typeof fetch;
    const client = new HttpAssessorClient('https://example.test/rp/', fetchImpl);
    const hit = await client.lookupByPin('1');
    expect(hit.scraped).toBe(true);
    expect(hit.ownerName).toMatch(/ACME/);
    expect(hit.fairMarketVal).toBe(1_250_000);
  });

  it('respects ASSESSOR_SCRAPER_ENABLED=false', async () => {
    const client = createAssessorClient({ ASSESSOR_SCRAPER_ENABLED: 'false' });
    const hit = await client.lookupByPin('1');
    expect(hit.scraped).toBe(false);
    expect(hit.source).toBe('link_only');
  });
});
