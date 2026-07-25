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
} as const;
