import { describe, expect, it } from "vitest";

import {
  createReadyMediaPage,
  decodeReadyMediaCursor,
  encodeReadyMediaCursor,
  normalizeReadyMediaPageSize,
  READY_MEDIA_PAGE_SIZE,
} from "./ready-media-pagination";

const createdAt = new Date("2026-07-18T12:00:00.000Z");
const id = "018f1d3a-5f42-4c2e-9a5d-0f1f2a3b4c5d";

describe("ready media cursor pagination", () => {
  it("encodes and decodes the opaque base64url cursor contract", () => {
    const cursor = encodeReadyMediaCursor({ createdAt, id });
    const rawPayload = Buffer.from(cursor, "base64url").toString("utf8");

    expect(cursor).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(JSON.parse(rawPayload)).toEqual({
      v: 1,
      createdAt: "2026-07-18T12:00:00.000Z",
      id,
    });
    expect(decodeReadyMediaCursor(cursor)).toEqual({
      createdAt: "2026-07-18T12:00:00.000Z",
      id,
    });
  });

  it("accepts generated ISO cursors with microsecond precision", () => {
    const cursor = encodeReadyMediaCursor({
      createdAt: "2026-07-18T12:00:00.123456Z",
      id,
    });

    expect(decodeReadyMediaCursor(cursor)).toEqual({
      createdAt: "2026-07-18T12:00:00.123456Z",
      id,
    });
  });

  it("rejects invalid cursors without throwing", () => {
    const validPayload = { v: 1, createdAt: createdAt.toISOString(), id };
    const invalidCursors = [
      "",
      "not json",
      Buffer.from("not json", "utf8").toString("base64url"),
      `${encodeReadyMediaCursor({ createdAt, id })}=`,
      Buffer.from(JSON.stringify({ ...validPayload, extra: true }), "utf8").toString(
        "base64url",
      ),
      Buffer.from(JSON.stringify({ ...validPayload, v: 2 }), "utf8").toString(
        "base64url",
      ),
      Buffer.from(
        JSON.stringify({ ...validPayload, createdAt: "2026-07-18T12:00:00Z" }),
        "utf8",
      ).toString("base64url"),
      Buffer.from(JSON.stringify({ ...validPayload, id: id.toUpperCase() }), "utf8").toString(
        "base64url",
      ),
      Buffer.from(
        JSON.stringify({ id, createdAt: createdAt.toISOString(), v: 1 }),
        "utf8",
      ).toString("base64url"),
      "a".repeat(193),
    ];

    for (const cursor of invalidCursors) {
      expect(decodeReadyMediaCursor(cursor)).toBeNull();
    }
  });

  it("builds pages from one extra row and caps custom page sizes", () => {
    const rows = [
      { createdAt, id },
      {
        createdAt: new Date("2026-07-18T11:00:00.000Z"),
        id: "018f1d3a-5f42-4c2e-9a5d-0f1f2a3b4c5e",
      },
      {
        createdAt: new Date("2026-07-18T10:00:00.000Z"),
        id: "018f1d3a-5f42-4c2e-9a5d-0f1f2a3b4c5f",
      },
    ];

    const page = createReadyMediaPage(rows, 2);

    expect(page.items.map((item) => item.id)).toEqual([rows[0].id, rows[1].id]);
    expect(page.nextCursor).toBe(
      encodeReadyMediaCursor({ createdAt: rows[1].createdAt, id: rows[1].id }),
    );
    expect(normalizeReadyMediaPageSize(999)).toBe(READY_MEDIA_PAGE_SIZE);
    expect(normalizeReadyMediaPageSize(0)).toBe(READY_MEDIA_PAGE_SIZE);
  });
});
