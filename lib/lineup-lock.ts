/**
 * Lineup change time-window utility.
 *
 * Changes to Playing XI are allowed between 3 PM and 6 AM Pacific Time.
 * Outside that window the lineup is locked (matches are in progress).
 *
 * The window spans midnight:
 *   OPEN:   15:00 PT  →  05:59 PT (next day)
 *   CLOSED: 06:00 PT  →  14:59 PT
 */

const TZ = "America/Los_Angeles";
export const WINDOW_OPEN_HOUR = 15; // 3 PM PT
export const WINDOW_CLOSE_HOUR = 6; // 6 AM PT

/** Get the current hour (0-23) in Pacific time, DST-aware. */
function pacificHour(now: Date = new Date()): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hour: "numeric",
    hour12: false,
  }).formatToParts(now);
  const hourPart = parts.find((p) => p.type === "hour");
  return parseInt(hourPart?.value ?? "0", 10);
}

/** True when lineup changes are allowed (3 PM – 6 AM Pacific). */
export function isLineupChangeWindowOpen(now: Date = new Date()): boolean {
  const h = pacificHour(now);
  // Open: 15-23 or 0-5  →  Closed: 6-14
  return h >= WINDOW_OPEN_HOUR || h < WINDOW_CLOSE_HOUR;
}

/**
 * Returns the current window status and the next open/close boundaries.
 *
 * `opensAt`  — next time the window opens  (only meaningful when currently closed)
 * `closesAt` — next time the window closes (only meaningful when currently open)
 */
export function getWindowStatus(now: Date = new Date()): {
  open: boolean;
  opensAt: Date;
  closesAt: Date;
} {
  const open = isLineupChangeWindowOpen(now);

  // Build a Date in Pacific by formatting and parsing components
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const h = parseInt(parts.hour ?? "0", 10);

  // Helper: build a Date from Pacific-time components
  const ptDate = (year: string, month: string, day: string, hour: number) => {
    // Build an ISO-ish string and resolve via the formatter round-trip
    const iso = `${year}-${month}-${day}T${String(hour).padStart(2, "0")}:00:00`;
    // Create in UTC then adjust — simpler: use a known offset approach
    // We rely on the fact that PT is UTC-8 (PST) or UTC-7 (PDT).
    // Instead, just compute the delta from `now`.
    const nowH = h;
    let deltaHours = hour - nowH;
    if (open) {
      // closesAt: next WINDOW_CLOSE_HOUR
      if (hour <= nowH) deltaHours += 24; // tomorrow
    } else {
      // opensAt: next WINDOW_OPEN_HOUR
      if (hour <= nowH) deltaHours += 24;
    }
    const target = new Date(now.getTime() + deltaHours * 3600_000);
    // Zero out minutes/seconds
    target.setMinutes(0, 0, 0);
    // Adjust for any partial-hour offset: snap to the exact hour boundary
    const targetH = pacificHour(target);
    if (targetH !== hour) {
      // DST edge — nudge by 1h
      target.setTime(target.getTime() + (hour - targetH) * 3600_000);
    }
    return target;
  };

  if (open) {
    // Next close is at WINDOW_CLOSE_HOUR
    const closesAt = ptDate(parts.year, parts.month, parts.day, WINDOW_CLOSE_HOUR);
    // Next open is at WINDOW_OPEN_HOUR (could be today if before 3 PM, else tomorrow)
    const opensAt = ptDate(parts.year, parts.month, parts.day, WINDOW_OPEN_HOUR);
    return { open, opensAt, closesAt };
  } else {
    // Next open is at WINDOW_OPEN_HOUR today
    const opensAt = ptDate(parts.year, parts.month, parts.day, WINDOW_OPEN_HOUR);
    // Next close is at WINDOW_CLOSE_HOUR tomorrow
    const closesAt = ptDate(parts.year, parts.month, parts.day, WINDOW_CLOSE_HOUR);
    return { open, opensAt, closesAt };
  }
}
