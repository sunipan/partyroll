import { describe, expect, it } from "vitest";

import { isValidCronAuthorization } from "./cleanup-auth";

describe("cleanup authorization", () => {
  const secret = "a-cleanup-secret-that-is-at-least-32-characters";

  it("accepts only the exact bearer secret", () => {
    expect(isValidCronAuthorization(`Bearer ${secret}`, secret)).toBe(true);
    expect(isValidCronAuthorization(`bearer ${secret}`, secret)).toBe(false);
    expect(isValidCronAuthorization(`Bearer ${secret}-wrong`, secret)).toBe(false);
  });

  it("fails closed when the header or secret is missing", () => {
    expect(isValidCronAuthorization(null, secret)).toBe(false);
    expect(isValidCronAuthorization("Bearer anything", undefined)).toBe(false);
  });
});
