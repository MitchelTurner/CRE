import { DEFAULT_FIELD_MAP } from '@cre/shared';
import { mapArcGisAttributes, parseArcGisDate } from './parcel.mapper';

describe('parcel.mapper', () => {
  it('maps verified layer-52 field names', () => {
    const mapped = mapArcGisAttributes(
      {
        PIN: '0123000100100',
        OWNAM1: 'ACME HOLDINGS LLC',
        OWNAM2: null,
        STREET: '100 MAIN ST',
        CITY: 'ATLANTA',
        STATE: 'GA',
        ZIP5: '30301',
        DEEDDATE: 978307200000,
        LANDUSE: '421',
        SUBDIV: null,
        STRNUM: '500',
        LOCATE: 'PEARL AVE',
        PROPTYPE: 'COMMERCIAL',
        FAIRMKTVAL: 1250000,
        SLPRICE: 900000,
        TOTTAX: 18450.25,
        PAIDDATE: null,
      },
      DEFAULT_FIELD_MAP,
      {
        commercialLandUseCodes: new Set(['421']),
        commercialPropTypes: new Set(['COMMERCIAL']),
        homeState: 'SC',
      },
    );

    expect(mapped).not.toBeNull();
    expect(mapped!.pin).toBe('0123000100100');
    expect(mapped!.situsAddress).toBe('500 PEARL AVE');
    expect(mapped!.owner.mailingState).toBe('GA');
    expect(mapped!.owner.isEntity).toBe(true);
    expect(mapped!.owner.isAbsentee).toBe(true);
    expect(mapped!.isCommercial).toBe(true);
    expect(mapped!.deedDate?.toISOString()).toBe('2001-01-01T00:00:00.000Z');
    expect(mapped!.salePrice).toBe(900000);
    expect(mapped!.totalTax).toBe(18450.25);
    expect(mapped!.paidDate).toBeNull();
  });

  it('parses ArcGIS epoch dates', () => {
    expect(parseArcGisDate(null)).toBeNull();
    expect(parseArcGisDate(978307200000)?.getUTCFullYear()).toBe(2001);
  });
});