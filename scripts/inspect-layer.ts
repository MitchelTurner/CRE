/**
 * M0 discovery spike: fetch ArcGIS layer metadata, field list, pagination
 * capabilities, and distinct LANDUSE / PROPTYPE values with counts.
 *
 * Usage: npx tsx scripts/inspect-layer.ts
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const LAYER_URL =
  process.env.ARCGIS_PARCEL_LAYER_URL ??
  'https://www.gcgis.org/arcgis/rest/services/GreenvilleJS/Map_Layers_JS/MapServer/52';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'GreenvilleCRE-LeadEngine/1.0 (+inspect-layer)',
      Accept: 'application/json',
    },
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  return (await res.json()) as T;
}

function queryUrl(params: Record<string, string>): string {
  const qs = new URLSearchParams({ f: 'json', ...params });
  return `${LAYER_URL}/query?${qs.toString()}`;
}

interface LayerMeta {
  name: string;
  maxRecordCount: number;
  advancedQueryCapabilities?: { supportsPagination?: boolean; supportsDistinct?: boolean };
  fields: Array<{ name: string; type: string; alias: string; length?: number }>;
}

interface QueryResult {
  features?: Array<{ attributes: Record<string, unknown> }>;
  count?: number;
  error?: { message: string };
}

async function main(): Promise<void> {
  console.log(`Fetching layer metadata: ${LAYER_URL}?f=json`);
  const meta = await fetchJson<LayerMeta>(`${LAYER_URL}?f=json`);

  const fields = meta.fields.map((f) => ({
    name: f.name,
    type: f.type,
    alias: f.alias,
    length: f.length ?? null,
  }));

  console.log('\n=== Fields ===');
  for (const f of fields) {
    console.log(`  ${f.name.padEnd(14)} ${f.type.padEnd(28)} ${f.alias}`);
  }

  const supportsPagination = meta.advancedQueryCapabilities?.supportsPagination ?? false;
  console.log(`\nmaxRecordCount: ${meta.maxRecordCount}`);
  console.log(`supportsPagination: ${supportsPagination}`);

  const countResult = await fetchJson<QueryResult>(
    queryUrl({ where: '1=1', returnCountOnly: 'true' }),
  );
  console.log(`total parcels: ${countResult.count ?? 'unknown'}`);

  console.log('\n=== Distinct LANDUSE ===');
  const landUse = await fetchJson<QueryResult>(
    queryUrl({
      where: '1=1',
      outFields: 'LANDUSE',
      returnDistinctValues: 'true',
      returnGeometry: 'false',
      orderByFields: 'LANDUSE',
    }),
  );
  const landUseValues = (landUse.features ?? []).map((f) => String(f.attributes.LANDUSE ?? ''));
  console.log(landUseValues.join(', '));

  console.log('\n=== Distinct PROPTYPE ===');
  const propTypes = await fetchJson<QueryResult>(
    queryUrl({
      where: '1=1',
      outFields: 'PROPTYPE',
      returnDistinctValues: 'true',
      returnGeometry: 'false',
      orderByFields: 'PROPTYPE',
    }),
  );
  const propTypeValues = (propTypes.features ?? []).map((f) => String(f.attributes.PROPTYPE ?? ''));

  const propTypeCounts: Record<string, number> = {};
  for (const pt of propTypeValues) {
    if (!pt) continue;
    const r = await fetchJson<QueryResult>(
      queryUrl({ where: `PROPTYPE='${pt.replace(/'/g, "''")}'`, returnCountOnly: 'true' }),
    );
    propTypeCounts[pt] = r.count ?? 0;
    console.log(`  ${pt}: ${propTypeCounts[pt]}`);
    await new Promise((r) => setTimeout(r, 250));
  }

  // Commercial LANDUSE via group-by stats
  const commercialCodes: Record<string, Record<string, number>> = {};
  for (const pt of ['COMMERCIAL', 'INDUSTRIAL', 'MULTI-FAMILY']) {
    const stats = await fetchJson<{
      features?: Array<{ attributes: { LANDUSE?: string; cnt?: number } }>;
    }>(
      queryUrl({
        where: `PROPTYPE='${pt}'`,
        outStatistics: JSON.stringify([
          { statisticType: 'count', onStatisticField: 'OBJECTID', outStatisticFieldName: 'cnt' },
        ]),
        groupByFieldsForStatistics: 'LANDUSE',
        orderByFields: 'LANDUSE',
      }),
    );
    for (const f of stats.features ?? []) {
      const code = String(f.attributes.LANDUSE ?? '');
      if (!code) continue;
      commercialCodes[code] ??= {};
      commercialCodes[code]![pt] = f.attributes.cnt ?? 0;
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  const report = {
    inspectedAt: new Date().toISOString(),
    layerUrl: LAYER_URL,
    layerName: meta.name,
    maxRecordCount: meta.maxRecordCount,
    supportsPagination,
    totalParcels: countResult.count ?? null,
    fields,
    fieldMappingNotes: {
      STREET: 'Mailing address (not situs)',
      STRNUM_LOCATE: 'Situs / site address = STRNUM + LOCATE',
      CITY_STATE_ZIP5: 'Owner mailing city/state/zip — absentee scoring available in v1',
      PROPTYPE: 'Useful commercial filter: COMMERCIAL | INDUSTRIAL | MULTI-FAMILY | ...',
      DEEDDATE: 'Epoch ms date field',
    },
    landUseValues,
    propTypeCounts,
    commercialLandUseByPropType: commercialCodes,
    openQuestions: {
      realPropertyDeepLink:
        'County Real Property search is ASP.NET form POST — no stable PIN deep-link found; link to search homepage for now.',
      commercialCodesNeedAgentReview: true,
      multifamilyIncludedByDefault: true,
    },
  };

  mkdirSync(join(process.cwd(), 'data'), { recursive: true });
  const outPath = join(process.cwd(), 'data', 'layer-inspection.json');
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`\nWrote ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});