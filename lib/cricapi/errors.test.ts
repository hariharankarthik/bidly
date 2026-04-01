import { describe, it, expect } from "vitest";
import {
  classifyCricApiError,
  CricApiError,
  isCricApiError,
} from "./errors";

describe("classifyCricApiError", () => {
  describe("rate-limit / quota errors", () => {
    it("detects 'hits today exceeded hits limit'", () => {
      const result = classifyCricApiError(
        "CricAPI: hits today exceeded hits limit",
      );
      expect(result.code).toBe("RATE_LIMIT");
      expect(result.retryable).toBe(true);
      expect(result.friendlyTitle).toMatch(/limit/i);
      // Must not contain raw provider text
      expect(result.friendlyMessage).not.toMatch(/hits today exceeded/i);
    });

    it("detects 'hit exceeded hit limit' (singular)", () => {
      const result = classifyCricApiError("hit exceeded hit limit");
      expect(result.code).toBe("RATE_LIMIT");
    });

    it("detects 'rate limit' in message", () => {
      const result = classifyCricApiError("rate limit exceeded for your plan");
      expect(result.code).toBe("RATE_LIMIT");
    });

    it("detects 'quota exceeded'", () => {
      const result = classifyCricApiError("API quota exceeded");
      expect(result.code).toBe("RATE_LIMIT");
    });

    it("detects 'too many requests'", () => {
      const result = classifyCricApiError("too many requests");
      expect(result.code).toBe("RATE_LIMIT");
    });

    it("detects HTTP 429 even with generic message", () => {
      const result = classifyCricApiError(
        "CricAPI HTTP 429: some body",
        429,
      );
      expect(result.code).toBe("RATE_LIMIT");
      expect(result.retryable).toBe(true);
    });

    it("detects 'api credits reached'", () => {
      const result = classifyCricApiError(
        "api credits reached for today",
      );
      expect(result.code).toBe("RATE_LIMIT");
    });
  });

  describe("auth errors", () => {
    it("detects 'invalid api key'", () => {
      const result = classifyCricApiError("invalid api key");
      expect(result.code).toBe("AUTH_FAILURE");
      expect(result.retryable).toBe(false);
    });

    it("detects HTTP 401", () => {
      const result = classifyCricApiError("CricAPI HTTP 401: Unauthorized", 401);
      expect(result.code).toBe("AUTH_FAILURE");
    });

    it("detects HTTP 403", () => {
      const result = classifyCricApiError("CricAPI HTTP 403: Forbidden", 403);
      expect(result.code).toBe("AUTH_FAILURE");
    });
  });

  describe("missing key", () => {
    it("detects 'CRICAPI_KEY is not set'", () => {
      const result = classifyCricApiError(
        "CRICAPI_KEY is not set. Add it in Vercel / .env.local.",
      );
      expect(result.code).toBe("MISSING_KEY");
      expect(result.retryable).toBe(false);
      expect(result.friendlyTitle).toMatch(/not configured/i);
    });
  });

  describe("empty scorecard", () => {
    it("detects 'no scorecard data'", () => {
      const result = classifyCricApiError(
        "CricAPI returned no scorecard data (check API key, credits, and match_scorecard access).",
      );
      expect(result.code).toBe("EMPTY_SCORECARD");
      expect(result.retryable).toBe(true);
    });
  });

  describe("provider failure", () => {
    it("detects 'returned a failure status'", () => {
      const result = classifyCricApiError("CricAPI returned a failure status.");
      expect(result.code).toBe("PROVIDER_FAILURE");
      expect(result.retryable).toBe(true);
    });
  });

  describe("unknown errors", () => {
    it("returns safe generic fallback for unrecognized errors", () => {
      const result = classifyCricApiError("some random unexpected error xyz");
      expect(result.code).toBe("UNKNOWN");
      expect(result.retryable).toBe(true);
      expect(result.friendlyTitle).toBe("Something went wrong");
      expect(result.friendlyMessage).toMatch(/try again later/i);
      // Must not contain raw error text
      expect(result.friendlyMessage).not.toContain("xyz");
    });
  });

  describe("friendly messages never leak raw strings", () => {
    const rawMessages = [
      "CricAPI: hits today exceeded hits limit",
      "CricAPI HTTP 429: {\"status\":\"failure\",\"reason\":\"too many\"}",
      "invalid api key abc123def",
      "CricAPI returned no scorecard data (check API key, credits, and match_scorecard access).",
      "Some internal stack trace Error at Object.<anonymous>",
    ];

    for (const raw of rawMessages) {
      it(`does not leak raw text for: "${raw.slice(0, 50)}..."`, () => {
        const result = classifyCricApiError(raw);
        expect(result.friendlyMessage).not.toContain("HTTP");
        expect(result.friendlyMessage).not.toContain("stack trace");
        expect(result.friendlyMessage).not.toContain("abc123def");
      });
    }
  });
});

describe("CricApiError", () => {
  it("carries classified metadata", () => {
    const err = new CricApiError("hits today exceeded hits limit");
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe("CricApiError");
    expect(err.classified.code).toBe("RATE_LIMIT");
    expect(err.message).toBe("hits today exceeded hits limit");
  });

  it("passes HTTP status through", () => {
    const err = new CricApiError("CricAPI HTTP 429: body", 429);
    expect(err.httpStatus).toBe(429);
    expect(err.classified.code).toBe("RATE_LIMIT");
  });
});

describe("isCricApiError", () => {
  it("returns true for CricApiError instances", () => {
    expect(isCricApiError(new CricApiError("test"))).toBe(true);
  });

  it("returns false for plain Errors", () => {
    expect(isCricApiError(new Error("test"))).toBe(false);
  });

  it("returns false for non-errors", () => {
    expect(isCricApiError("test")).toBe(false);
    expect(isCricApiError(null)).toBe(false);
  });
});
