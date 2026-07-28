export type SoftReq = {
  minClearHeight: number | null;
  minDockDoors: number | null;
  minYardAcres: number | null;
};

export type SoftAttrs = {
  clearHeightFt: number | null;
  dockDoors: number | null;
  yardAcres: number | null;
};

export function softScore(req: SoftReq, a: SoftAttrs): number {
  let score = 40;
  if (req.minClearHeight != null && a.clearHeightFt != null) {
    const headroom = a.clearHeightFt - req.minClearHeight;
    if (headroom >= 0) score += Math.min(30, headroom * 3);
    else score -= 10;
  } else if (req.minClearHeight != null) {
    score -= 10;
  }
  if (req.minDockDoors != null && a.dockDoors != null) {
    const ratio = a.dockDoors / Math.max(1, req.minDockDoors);
    score += Math.min(15, ratio * 8);
  }
  if (req.minYardAcres != null && a.yardAcres != null) {
    const yardHead = a.yardAcres - req.minYardAcres;
    if (yardHead >= 0) score += Math.min(15, 5 + yardHead * 2);
    else score -= 5;
  }
  return Math.max(0, score);
}

export function buildExplanation(
  req: SoftReq & {
    railRequired: boolean;
    minSf: number | null;
    maxSf: number | null;
  },
  a: SoftAttrs & {
    railServed: boolean | null;
    buildingSf: number | null;
  },
  isListed: boolean,
): string {
  const parts: string[] = [];
  if (a.clearHeightFt != null && req.minClearHeight != null) {
    parts.push(`${a.clearHeightFt}' clear vs ${req.minClearHeight}' required`);
  } else if (a.clearHeightFt != null) {
    parts.push(`${a.clearHeightFt}' clear`);
  }
  if (a.yardAcres != null && req.minYardAcres != null) {
    parts.push(`${a.yardAcres} yard acres vs ${req.minYardAcres} required`);
  } else if (a.yardAcres != null) {
    parts.push(`${a.yardAcres} yard acres`);
  }
  if (a.dockDoors != null) {
    parts.push(
      req.minDockDoors != null
        ? `${a.dockDoors} docks vs ${req.minDockDoors} required`
        : `${a.dockDoors} docks`,
    );
  }
  if (a.buildingSf != null) {
    parts.push(`${a.buildingSf.toLocaleString('en-US')} SF`);
  }
  if (a.railServed) parts.push('rail-served');
  else if (req.railRequired) parts.push('rail required — not served');
  parts.push(isListed ? 'listed' : 'off-market');
  return parts.join('; ');
}

/** Test aliases */
export const softScoreForTest = softScore;
export const buildExplanationForTest = buildExplanation;
