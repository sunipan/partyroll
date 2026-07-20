import { describe, expect, it } from "vitest";

import { formatByteSize } from "./format-byte-size";

describe("formatByteSize", () => {
  it.each([
    [0, "0 B"],
    [1, "1 B"],
    [1023, "1,023 B"],
    [1024, "1 KB"],
    [42 * 1024, "42 KB"],
    [100 * 1024, "0.1 MB"],
    [Math.round(37.2 * 1024 * 1024), "37.2 MB"],
  ])("formats %i bytes as %s", (bytes, expected) => {
    expect(formatByteSize(bytes)).toBe(expected);
  });
});
