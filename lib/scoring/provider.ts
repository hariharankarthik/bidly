/**
 * Provider interface for fetching cricket scorecard data.
 *
 * Both CricAPI and fallback providers (Cricsheet) implement this interface
 * so the scoring pipeline can swap data sources transparently.
 */

import type { CricApiMappedPerformance } from "@/lib/cricapi/fetch-scorecard";

export interface ScorecardProvider {
  readonly name: string;

  /**
   * Fetch scorecard data for a match and return normalised performances.
   * @param matchId Provider-specific match identifier.
   * @returns Array of player performances with names and stats.
   */
  fetchScorecard(matchId: string): Promise<CricApiMappedPerformance[]>;
}
