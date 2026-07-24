import {
  buildMailingAddress,
  buildSitusAddress,
  combineOwnerNames,
  isAbsenteeOwner,
  isEntityOwner,
  normalizeOwnerName,
  type FieldMap,
} from '@cre/shared';

export interface MappedParcel {
  pin: string;
  situsAddress: string | null;
  landUseCode: string | null;
  propType: string | null;
  subdivision: string | null;
  deedDate: Date | null;
  fairMarketVal: number | null;
  rawAttributes: Record<string, unknown>;
  isCommercial: boolean;
  owner: {
    nameRaw: string;
    nameNormalized: string;
    mailingAddress: string | null;
    mailingCity: string | null;
    mailingState: string | null;
    mailingZip: string | null;
    mailingStreet: string | null;
    isEntity: boolean;
    isAbsentee: boolean;
  };
}

function asString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function asInt(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : null;
}

/** ArcGIS date fields arrive as epoch milliseconds. */
export function parseArcGisDate(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    const asNum = Number(value);
    if (Number.isFinite(asNum) && value.trim() !== '') {
      const d = new Date(asNum);
      if (!Number.isNaN(d.getTime())) return d;
    }
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

export function mapArcGisAttributes(
  attrs: Record<string, unknown>,
  fieldMap: FieldMap,
  options: {
    commercialLandUseCodes: Set<string>;
    commercialPropTypes: Set<string>;
    homeState: string;
  },
): MappedParcel | null {
  const pin = asString(attrs[fieldMap.pin]);
  if (!pin) return null;

  const nameRaw = combineOwnerNames(
    asString(attrs[fieldMap.ownerName1]),
    asString(attrs[fieldMap.ownerName2]),
  );
  const mailingStreet = asString(attrs[fieldMap.mailingStreet]);
  const mailingCity = asString(attrs[fieldMap.mailingCity]);
  const mailingState = asString(attrs[fieldMap.mailingState]);
  const mailingZip = asString(attrs[fieldMap.mailingZip]);
  const situsAddress = buildSitusAddress(
    asString(attrs[fieldMap.situsNumber]),
    asString(attrs[fieldMap.situsStreet]),
  );
  const landUseCode = asString(attrs[fieldMap.landUse]);
  const propType = asString(attrs[fieldMap.propType]);

  const isCommercial =
    (propType !== null && options.commercialPropTypes.has(propType)) ||
    (landUseCode !== null && options.commercialLandUseCodes.has(landUseCode));

  return {
    pin,
    situsAddress,
    landUseCode,
    propType,
    subdivision: asString(attrs[fieldMap.subdivision]),
    deedDate: parseArcGisDate(attrs[fieldMap.deedDate]),
    fairMarketVal: asInt(attrs[fieldMap.fairMarketVal]),
    rawAttributes: attrs,
    isCommercial,
    owner: {
      nameRaw: nameRaw || 'UNKNOWN',
      nameNormalized: normalizeOwnerName(nameRaw || 'UNKNOWN'),
      mailingAddress: buildMailingAddress(mailingStreet, mailingCity, mailingState, mailingZip),
      mailingCity,
      mailingState,
      mailingZip,
      mailingStreet,
      isEntity: isEntityOwner(nameRaw || ''),
      isAbsentee: isAbsenteeOwner({
        mailingStreet,
        situsAddress,
        mailingState,
        homeState: options.homeState,
      }),
    },
  };
}