import { readFileSync } from 'fs';
import { join } from 'path';
import { EchoConnector } from './echo.connector';

describe('EchoConnector.normalize', () => {
  const prisma = {
    industrialSignal: {
      findMany: async () => [],
      findFirst: async () => null,
    },
  };
  const connector = new EchoConnector(prisma as never);
  const fixtures = JSON.parse(
    readFileSync(join(__dirname, '../../../test/fixtures/signals/echo-sample.json'), 'utf8'),
  ) as Array<Record<string, unknown>>;

  it('maps air FCE to ENV_PERMIT weight 25', () => {
    const drafts = connector.normalize({
      sourceRef: 'echo:air:test',
      fetchedAt: new Date(),
      body: fixtures[0],
    });
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.type).toBe('ENV_PERMIT');
    expect(drafts[0]!.subtype).toBe('air_fce');
    expect(drafts[0]!.weight).toBe(25);
    expect(drafts[0]!.companyName).toMatch(/Upstate Coatings/i);
  });

  it('maps RCRA increase to GENERATOR_STATUS_CHANGE weight 35', () => {
    const drafts = connector.normalize({
      sourceRef: 'echo:rcra:test',
      fetchedAt: new Date(),
      body: fixtures[1],
    });
    expect(drafts[0]!.type).toBe('GENERATOR_STATUS_CHANGE');
    expect(drafts[0]!.subtype).toBe('rcra_increase');
    expect(drafts[0]!.weight).toBe(35);
    expect(drafts[0]!.payload).toMatchObject({
      priorUniverse: 'SQG',
      rcraUniverse: 'LQG',
    });
  });

  it('maps new NPDES to ENV_PERMIT weight 30', () => {
    const drafts = connector.normalize({
      sourceRef: 'echo:cwa:test',
      fetchedAt: new Date(),
      body: fixtures[2],
    });
    expect(drafts[0]!.type).toBe('ENV_PERMIT');
    expect(drafts[0]!.subtype).toBe('npdes_new');
    expect(drafts[0]!.weight).toBe(30);
  });
});
