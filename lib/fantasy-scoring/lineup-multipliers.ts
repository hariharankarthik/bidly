/**
 * Starting XI gating + captain (2×) / vice-captain (1.5×) on raw fantasy points for one player in one match.
 */

export function effectivePointsWithLineup(
  basePoints: number,
  playerId: string,
  opts: {
    /** Empty = all squad members who have stats count (backward compatible). */
    startingXiPlayerIds: string[];
    captainPlayerId: string | null;
    viceCaptainPlayerId: string | null;
  },
): { effective: number; counted: boolean; multiplier: number } {
  const xi = opts.startingXiPlayerIds;
  const inXi = xi.length === 0 || xi.includes(playerId);
  if (!inXi) {
    return { effective: 0, counted: false, multiplier: 0 };
  }

  let mult = 1;
  if (opts.captainPlayerId && opts.captainPlayerId === playerId) mult = 2;
  else if (opts.viceCaptainPlayerId && opts.viceCaptainPlayerId === playerId) mult = 1.5;

  const effective = Math.round(basePoints * mult * 100) / 100;
  return { effective, counted: true, multiplier: mult };
}
