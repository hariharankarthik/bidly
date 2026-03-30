/**
 * Real cricket data bridge (CricAPI, Entitysport, Sportmonks, etc.).
 *
 * Intended flow after each IPL match:
 * 1. Scheduler / webhook receives `match_id` from your provider.
 * 2. Fetch full scorecard (batting, bowling, fielding, dismissals).
 * 3. Map each row to `PlayerMatchStats` + resolve `players.id` (name ↔ UUID).
 * 4. POST `/api/scores/calculate` with `{ league_id, match_id, match_date, performances: [...] }`.
 *
 * Set `CRICAPI_KEY` in `.env` when you wire a concrete provider; this module stays a typed stub until then.
 */
export type CricapiConfig = {
  apiKey: string;
  baseUrl?: string;
};

export async function fetchMatchScorecardPlaceholder(externalMatchId: string): Promise<null> {
  void externalMatchId;
  return null;
}

export function getCricapiKey(): string | undefined {
  return process.env.CRICAPI_KEY?.trim() || undefined;
}
