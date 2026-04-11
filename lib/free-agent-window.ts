/**
 * Returns the most recent Saturday at 8:30 AM Pacific Time as a Date.
 * The free agent window resets at this boundary each week.
 */
export function getFreeAgentWeekStart(now: Date = new Date()): Date {
  // Convert to Pacific Time using Intl to get the correct local day/time
  const ptStr = now.toLocaleString("en-US", { timeZone: "America/Los_Angeles" });
  const ptDate = new Date(ptStr);
  const dow = ptDate.getDay(); // 0=Sun, 6=Sat

  // Days since last Saturday: Sun=1, Mon=2, ..., Fri=6, Sat=0
  const daysSinceSat = (dow + 1) % 7;

  // Build the Saturday date in PT
  const satPt = new Date(ptDate);
  satPt.setDate(satPt.getDate() - daysSinceSat);
  satPt.setHours(8, 30, 0, 0);

  // If we're on Saturday but before 8:30 AM PT, use the previous Saturday
  if (daysSinceSat === 0 && ptDate < satPt) {
    satPt.setDate(satPt.getDate() - 7);
  }

  // Get PT offset (PST vs PDT)
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    timeZoneName: "short",
  });
  const parts = formatter.formatToParts(now);
  const tzName = parts.find((p) => p.type === "timeZoneName")?.value ?? "";
  const offset = tzName === "PST" ? "-08:00" : "-07:00";

  const iso = satPt.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" }); // YYYY-MM-DD
  return new Date(`${iso}T08:30:00${offset}`);
}

/**
 * Compute the next Saturday 8:30 AM PT reset time, formatted in multiple timezones.
 */
export function getNextResetTime(now: Date = new Date()): { pt: string; ist: string; et: string; raw: Date } {
  const weekStart = getFreeAgentWeekStart(now);
  // Next reset is weekStart + 7 days
  const next = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

  const fmt = (tz: string) =>
    next.toLocaleString("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });

  return {
    pt: fmt("America/Los_Angeles"),
    ist: fmt("Asia/Kolkata"),
    et: fmt("America/New_York"),
    raw: next,
  };
}

/**
 * Check if a team has already used their free agent window this week.
 */
export function isFreeAgentWindowUsed(faWindowUsedAt: string | null, now: Date = new Date()): boolean {
  if (!faWindowUsedAt) return false;
  const weekStart = getFreeAgentWeekStart(now);
  return new Date(faWindowUsedAt) >= weekStart;
}
