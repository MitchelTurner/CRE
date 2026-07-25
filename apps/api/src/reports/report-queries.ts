/**
 * All market-report aggregate SQL lives here so dashboard charts can reuse later.
 */
export const REPORT_QUERIES = {
  byLandUse: `
    SELECT COALESCE(p."propType", p."landUseCode", 'Unknown') AS bucket,
           COUNT(*)::int AS parcel_count
    FROM "Parcel" p
    WHERE p."isActive" = true AND p."isCommercial" = true
    GROUP BY 1
    ORDER BY parcel_count DESC
    LIMIT 20
  `,
  byZip: `
    SELECT COALESCE(o."mailingZip", 'Unknown') AS bucket,
           COUNT(*)::int AS parcel_count
    FROM "Parcel" p
    LEFT JOIN "Owner" o ON o.id = p."ownerId"
    WHERE p."isActive" = true AND p."isCommercial" = true
    GROUP BY 1
    ORDER BY parcel_count DESC
    LIMIT 20
  `,
  holdBuckets: `
    SELECT
      CASE
        WHEN p."deedDate" IS NULL THEN 'unknown'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), p."deedDate")) >= 15 THEN '15y+'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), p."deedDate")) >= 10 THEN '10-14y'
        WHEN EXTRACT(YEAR FROM AGE(NOW(), p."deedDate")) >= 5 THEN '5-9y'
        ELSE 'under_5y'
      END AS bucket,
      COUNT(*)::int AS parcel_count
    FROM "Parcel" p
    WHERE p."isActive" = true AND p."isCommercial" = true
    GROUP BY 1
  `,
  absenteeShare: `
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE o."isAbsentee" = true)::int AS absentee,
      COUNT(*) FILTER (WHERE o."mailingState" IS NOT NULL AND o."mailingState" <> $1)::int AS out_of_state
    FROM "Parcel" p
    LEFT JOIN "Owner" o ON o.id = p."ownerId"
    WHERE p."isActive" = true AND p."isCommercial" = true
  `,
  bySubmarket: `
    SELECT COALESCE(p.submarket, 'untagged') AS bucket,
           COUNT(*)::int AS parcel_count
    FROM "Parcel" p
    WHERE p."isActive" = true AND p."isCommercial" = true
    GROUP BY 1
    ORDER BY parcel_count DESC
    LIMIT 20
  `,
  saleComps: `
    SELECT
      COUNT(*)::int AS comp_count,
      COUNT(*) FILTER (WHERE "salePrice" IS NOT NULL)::int AS priced_count,
      COALESCE(AVG("salePrice") FILTER (WHERE "salePrice" IS NOT NULL), 0)::float AS avg_price,
      COALESCE(PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY "salePrice")
        FILTER (WHERE "salePrice" IS NOT NULL), 0)::float AS median_price
    FROM "SaleComp"
    WHERE "recordedAt" >= $1 AND "recordedAt" <= $2
  `,
} as const;
