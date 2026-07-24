export interface LatLon {
  latitude: number;
  longitude: number;
}

type Ring = number[][];

/**
 * Best-effort centroid from ArcGIS geometry (point, multipoint, or polygon rings).
 * Expects WGS84 when queried with outSR=4326.
 */
export function centroidFromGeometry(geometry: unknown): LatLon | null {
  if (!geometry || typeof geometry !== 'object') return null;
  const g = geometry as Record<string, unknown>;

  if (typeof g.x === 'number' && typeof g.y === 'number') {
    return { longitude: g.x, latitude: g.y };
  }

  if (Array.isArray(g.points) && g.points.length) {
    const pts = g.points as number[][];
    const sum = pts.reduce(
      (acc, p) => {
        acc.lon += p[0] ?? 0;
        acc.lat += p[1] ?? 0;
        return acc;
      },
      { lon: 0, lat: 0 },
    );
    return { longitude: sum.lon / pts.length, latitude: sum.lat / pts.length };
  }

  const rings = (g.rings as Ring[] | undefined) ?? (g.paths as Ring[] | undefined);
  if (rings?.length && rings[0]?.length) {
    const ring = rings[0]!;
    // Skip closing point if duplicated
    const usable =
      ring.length > 1 &&
      ring[0]![0] === ring[ring.length - 1]![0] &&
      ring[0]![1] === ring[ring.length - 1]![1]
        ? ring.slice(0, -1)
        : ring;
    if (!usable.length) return null;
    const sum = usable.reduce(
      (acc, p) => {
        acc.lon += p[0] ?? 0;
        acc.lat += p[1] ?? 0;
        return acc;
      },
      { lon: 0, lat: 0 },
    );
    return { longitude: sum.lon / usable.length, latitude: sum.lat / usable.length };
  }

  return null;
}
