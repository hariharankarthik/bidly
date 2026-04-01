import { describe, expect, it } from "vitest";
import { normalizeInviteCode, resolveJoinTarget } from "./resolve-invite-code";

describe("normalizeInviteCode", () => {
  it("trims and uppercases", () => {
    expect(normalizeInviteCode("  abc12x ")).toEqual({ code: "ABC12X", codeRaw: "abc12x" });
  });

  it("handles already-uppercase input", () => {
    expect(normalizeInviteCode("9HVXGC")).toEqual({ code: "9HVXGC", codeRaw: "9HVXGC" });
  });

  it("handles empty string", () => {
    expect(normalizeInviteCode("")).toEqual({ code: "", codeRaw: "" });
  });

  it("handles whitespace-only", () => {
    expect(normalizeInviteCode("   ")).toEqual({ code: "", codeRaw: "" });
  });
});

describe("resolveJoinTarget", () => {
  it("resolves auction room", () => {
    const result = resolveJoinTarget({ id: "room-uuid" }, null);
    expect(result).toEqual({ kind: "room", url: "/room/room-uuid/lobby" });
  });

  it("resolves private league", () => {
    const result = resolveJoinTarget(null, { id: "league-uuid", league_kind: "private" });
    expect(result).toEqual({ kind: "league", url: "/league/private/league-uuid" });
  });

  it("resolves auction league", () => {
    const result = resolveJoinTarget(null, { id: "league-uuid", league_kind: "auction" });
    expect(result).toEqual({ kind: "league", url: "/league/league-uuid" });
  });

  it("prefers room over league when both match", () => {
    const result = resolveJoinTarget(
      { id: "room-uuid" },
      { id: "league-uuid", league_kind: "private" },
    );
    expect(result).toEqual({ kind: "room", url: "/room/room-uuid/lobby" });
  });

  it("returns not-found when neither match", () => {
    expect(resolveJoinTarget(null, null)).toEqual({ kind: "not-found" });
    expect(resolveJoinTarget(undefined, undefined)).toEqual({ kind: "not-found" });
  });
});
