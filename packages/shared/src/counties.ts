import {
  DEFAULT_COMMERCIAL_LANDUSE_CODES,
  DEFAULT_COMMERCIAL_PROP_TYPES,
  DEFAULT_FIELD_MAP,
  DEFAULT_LANDUSE_PRIORITY,
  type FieldMap,
} from './types';

export interface CountyPreset {
  slug: string;
  name: string;
  homeState: string;
  parcelLayerUrl: string;
  parcelLinkBase: string;
  fieldMap: FieldMap;
  commercialPropTypes: string[];
  commercialLandUseCodes: string[];
  landUsePriority: Record<string, number>;
  notes: string;
}

/** Greenville is production-ready; Spartanburg is a clone scaffold (verify layer fields). */
export const COUNTY_PRESETS: Record<string, CountyPreset> = {
  greenville: {
    slug: 'greenville',
    name: 'Greenville',
    homeState: 'SC',
    parcelLayerUrl:
      'https://www.gcgis.org/arcgis/rest/services/GreenvilleJS/Map_Layers_JS/MapServer/52',
    parcelLinkBase: 'https://www.greenvillecounty.org/appsas400/RealProperty/',
    fieldMap: DEFAULT_FIELD_MAP,
    commercialPropTypes: [...DEFAULT_COMMERCIAL_PROP_TYPES],
    commercialLandUseCodes: [...DEFAULT_COMMERCIAL_LANDUSE_CODES],
    landUsePriority: DEFAULT_LANDUSE_PRIORITY,
    notes: 'Primary deployment. Layer 52 verified 2026-07-24.',
  },
  spartanburg: {
    slug: 'spartanburg',
    name: 'Spartanburg',
    homeState: 'SC',
    parcelLayerUrl:
      'https://gis.spartanburgcounty.org/arcgis/rest/services/Open_Data/Parcel/MapServer/0',
    parcelLinkBase: 'https://www.spartanburgcounty.org/',
    // Start from Greenville map; override via AppConfig after inspect:layer.
    fieldMap: DEFAULT_FIELD_MAP,
    commercialPropTypes: [...DEFAULT_COMMERCIAL_PROP_TYPES],
    commercialLandUseCodes: [...DEFAULT_COMMERCIAL_LANDUSE_CODES],
    landUsePriority: DEFAULT_LANDUSE_PRIORITY,
    notes:
      'Clone scaffold. Run npm run inspect:layer against the county URL, then patch FIELD_MAP in AppConfig.',
  },
};

export function getCountyPreset(slug: string): CountyPreset {
  const key = slug.trim().toLowerCase();
  return COUNTY_PRESETS[key] ?? COUNTY_PRESETS.greenville!;
}
