/**
 * Classifies CricAPI errors into user-friendly messages.
 *
 * The classifier inspects raw error strings, HTTP status codes, and CricAPI
 * JSON response payloads to detect known failure modes (rate-limit, quota,
 * auth, missing config) and returns a structured object suitable for API
 * responses and toast notifications.
 */

export type CricApiErrorCode =
  | "RATE_LIMIT"
  | "AUTH_FAILURE"
  | "MISSING_KEY"
  | "PROVIDER_FAILURE"
  | "EMPTY_SCORECARD"
  | "UNKNOWN";

export type ClassifiedError = {
  code: CricApiErrorCode;
  friendlyTitle: string;
  friendlyMessage: string;
  retryable: boolean;
};

/** Patterns that indicate CricAPI rate-limit / quota exhaustion. */
const RATE_LIMIT_PATTERNS = [
  /hits?\s+(today\s+)?exceeded\s+hits?\s+limit/i,
  /rate\s*limit/i,
  /quota\s*(exceeded|exhausted|reached)/i,
  /too\s+many\s+requests/i,
  /api\s+(limit|credits?)\s*(reached|exceeded|exhausted)/i,
];

const AUTH_PATTERNS = [
  /invalid\s+(api\s*)?key/i,
  /unauthorized/i,
  /forbidden/i,
  /authentication\s+failed/i,
  /access\s+denied/i,
];

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((p) => p.test(text));
}

/**
 * Classify a raw error message and optional HTTP status into a friendly error.
 */
export function classifyCricApiError(
  message: string,
  httpStatus?: number,
): ClassifiedError {
  // Missing API key (config error)
  if (/CRICAPI_KEY\s*(is\s+)?not\s+set/i.test(message)) {
    return {
      code: "MISSING_KEY",
      friendlyTitle: "Cricket API not configured",
      friendlyMessage:
        "The server API key for CricAPI is missing. Ask the admin to set CRICAPI_KEY in the environment.",
      retryable: false,
    };
  }

  // Rate limit — check message text first
  if (matchesAny(message, RATE_LIMIT_PATTERNS) || httpStatus === 429) {
    return {
      code: "RATE_LIMIT",
      friendlyTitle: "Daily API limit reached",
      friendlyMessage:
        "The free CricAPI quota has been used up for today. Scores will sync automatically tomorrow, or the admin can upgrade the API plan.",
      retryable: true,
    };
  }

  // Auth failures
  if (matchesAny(message, AUTH_PATTERNS) || httpStatus === 401 || httpStatus === 403) {
    return {
      code: "AUTH_FAILURE",
      friendlyTitle: "API authentication failed",
      friendlyMessage:
        "The CricAPI key is invalid or expired. Ask the admin to check the API key configuration.",
      retryable: false,
    };
  }

  // Empty scorecard / no data
  if (/no\s+scorecard\s+data/i.test(message) || /returned\s+no\s+.*data/i.test(message)) {
    return {
      code: "EMPTY_SCORECARD",
      friendlyTitle: "Scorecard not available",
      friendlyMessage:
        "CricAPI returned an empty scorecard. The match may not have started yet, or the data isn't available on the free plan.",
      retryable: true,
    };
  }

  // Provider failure (CricAPI returned status: failure/error)
  if (/returned\s+a?\s*failure\s+status/i.test(message) || /CricAPI.*failure/i.test(message)) {
    return {
      code: "PROVIDER_FAILURE",
      friendlyTitle: "Cricket data temporarily unavailable",
      friendlyMessage:
        "CricAPI returned an error. This is usually temporary — try again in a few minutes.",
      retryable: true,
    };
  }

  // Generic / unknown
  return {
    code: "UNKNOWN",
    friendlyTitle: "Something went wrong",
    friendlyMessage:
      "Something went wrong while fetching match data. Please try again later.",
    retryable: true,
  };
}

/**
 * Custom error class that carries classified error metadata.
 * Thrown from CricAPI fetch functions so callers can extract friendly messages.
 */
export class CricApiError extends Error {
  public readonly classified: ClassifiedError;
  public readonly httpStatus?: number;

  constructor(rawMessage: string, httpStatus?: number) {
    const classified = classifyCricApiError(rawMessage, httpStatus);
    super(rawMessage);
    this.name = "CricApiError";
    this.classified = classified;
    this.httpStatus = httpStatus;
  }
}

/**
 * Checks if an unknown caught value is a CricApiError.
 */
export function isCricApiError(e: unknown): e is CricApiError {
  return e instanceof CricApiError;
}
