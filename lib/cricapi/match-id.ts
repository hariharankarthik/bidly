/** CricAPI v1 `match_scorecard` expects `id` as a dashed hex UUID (see API “Guid” errors if malformed). */
const CRICAPI_MATCH_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isCricApiMatchUuid(s: string): boolean {
  return CRICAPI_MATCH_UUID.test(s.trim());
}

/** Returns trimmed id or throws a clear error (avoids CricAPI HTML 500 with opaque GUID message). */
export function parseCricApiMatchUuid(raw: string): string {
  const t = raw.trim();
  if (!t) {
    throw new Error("CricAPI match id is empty. Paste the UUID from currentMatches (field \"id\"), e.g. 55fe0f15-6eb0-4ad5-835b-5564be4f6a21.");
  }
  if (!isCricApiMatchUuid(t)) {
    throw new Error(
      `Invalid CricAPI match id — must be a UUID (32 hex digits with dashes). You pasted: ${JSON.stringify(t.slice(0, 64))}${t.length > 64 ? "…" : ""}. Use the "id" from CricAPI currentMatches, not unique_id or an internal id.`,
    );
  }
  return t;
}
