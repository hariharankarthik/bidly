import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { isLineupChangeWindowOpen, getWindowStatus, WINDOW_OPEN_HOUR, WINDOW_CLOSE_HOUR } from "./lineup-lock";

/** Create a Date object for a specific Pacific time hour on a given date. */
function makeDateAtPacificHour(hour: number, minute = 0): Date {
  // Use a known date where PDT applies (July 15 2025, UTC-7)
  // PT hour 15 = UTC hour 22
  const utcHour = hour + 7; // PDT offset
  const d = new Date(Date.UTC(2025, 6, 15, utcHour, minute, 0, 0));
  return d;
}

describe("isLineupChangeWindowOpen", () => {
  it("returns true at 3 PM PT (window opens)", () => {
    expect(isLineupChangeWindowOpen(makeDateAtPacificHour(15))).toBe(true);
  });

  it("returns true at 11 PM PT", () => {
    expect(isLineupChangeWindowOpen(makeDateAtPacificHour(23))).toBe(true);
  });

  it("returns true at midnight PT", () => {
    expect(isLineupChangeWindowOpen(makeDateAtPacificHour(0))).toBe(true);
  });

  it("returns true at 5 AM PT", () => {
    expect(isLineupChangeWindowOpen(makeDateAtPacificHour(5))).toBe(true);
  });

  it("returns false at 6 AM PT (window closes)", () => {
    expect(isLineupChangeWindowOpen(makeDateAtPacificHour(6))).toBe(false);
  });

  it("returns false at 10 AM PT", () => {
    expect(isLineupChangeWindowOpen(makeDateAtPacificHour(10))).toBe(false);
  });

  it("returns false at 2 PM PT", () => {
    expect(isLineupChangeWindowOpen(makeDateAtPacificHour(14))).toBe(false);
  });

  it("returns false at 2:59 PM PT", () => {
    expect(isLineupChangeWindowOpen(makeDateAtPacificHour(14, 59))).toBe(false);
  });
});

describe("getWindowStatus", () => {
  it("returns open=true during open window", () => {
    const status = getWindowStatus(makeDateAtPacificHour(20));
    expect(status.open).toBe(true);
  });

  it("returns open=false during closed window", () => {
    const status = getWindowStatus(makeDateAtPacificHour(10));
    expect(status.open).toBe(false);
  });

  it("opensAt is in the future when window is closed", () => {
    const now = makeDateAtPacificHour(10);
    const status = getWindowStatus(now);
    expect(status.open).toBe(false);
    expect(status.opensAt.getTime()).toBeGreaterThan(now.getTime());
  });

  it("closesAt is in the future when window is open", () => {
    const now = makeDateAtPacificHour(20);
    const status = getWindowStatus(now);
    expect(status.open).toBe(true);
    expect(status.closesAt.getTime()).toBeGreaterThan(now.getTime());
  });
});

describe("constants", () => {
  it("exports correct window hours", () => {
    expect(WINDOW_OPEN_HOUR).toBe(15);
    expect(WINDOW_CLOSE_HOUR).toBe(6);
  });
});
