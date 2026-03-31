import type { SportConfig } from "./types";

/** Placeholder for a future phase — not wired into the app yet. */
export const NFL_2026: SportConfig = {
  id: "nfl_2026",
  sportType: "football",
  displayName: "NFL 2026",
  currency: { symbol: "$", unit: "M", multiplier: 1 },
  purse: { default: 200, min: 100, max: 300 },
  timer: { default: 45, min: 15, max: 90 },
  lineup: { xiSize: 11 },
  roster: {
    maxTeams: 12,
    maxPlayers: 15,
    minPlayers: 10,
    roles: ["QB", "RB", "WR", "TE", "K", "DEF"],
    positionMins: { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 },
    specialRules: [],
  },
  scoring: [
    { action: "passing_td", label: "Passing TD", points: 4 },
    { action: "rushing_td", label: "Rushing TD", points: 6 },
    { action: "receiving_td", label: "Receiving TD", points: 6 },
    { action: "passing_yard", label: "Passing yard", points: 0.04 },
    { action: "rushing_yard", label: "Rushing yard", points: 0.1 },
    { action: "receiving_yard", label: "Receiving yard", points: 0.1 },
    { action: "interception", label: "Interception thrown", points: -2 },
    { action: "fumble", label: "Fumble lost", points: -2 },
  ],
  tiers: ["elite", "starter", "bench", "sleeper"],
  bidIncrements: [1, 2, 5, 10],
};
