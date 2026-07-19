export const READY_MEDIA_PAGE_SIZE = 24;

const MAX_READY_MEDIA_PAGE_SIZE = READY_MEDIA_PAGE_SIZE;
const MAX_CURSOR_LENGTH = 192;
const CURSOR_VALUE_PATTERN = /^[A-Za-z0-9_-]+$/;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}(?:\d{3})?Z$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export type ReadyMediaCursor = {
  createdAt: string;
  id: string;
};

export type ReadyMediaCursorSource = {
  createdAt: Date | string;
  id: string;
};

export type ReadyMediaPage<TItem> = {
  items: TItem[];
  nextCursor: string | null;
};

type ReadyMediaCursorPayload = {
  v: 1;
  createdAt: string;
  id: string;
};

export function encodeReadyMediaCursor(source: ReadyMediaCursorSource) {
  const payload = createReadyMediaCursorPayload(source);

  return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function decodeReadyMediaCursor(cursor: string): ReadyMediaCursor | null {
  if (!isValidCursorEnvelope(cursor)) {
    return null;
  }

  let rawPayload: string;
  let payload: unknown;

  try {
    rawPayload = Buffer.from(cursor, "base64url").toString("utf8");
    payload = JSON.parse(rawPayload);
  } catch {
    return null;
  }

  if (!isReadyMediaCursorPayload(payload)) {
    return null;
  }

  const canonicalPayload = JSON.stringify({
    v: 1,
    createdAt: payload.createdAt,
    id: payload.id,
  } satisfies ReadyMediaCursorPayload);

  if (
    rawPayload !== canonicalPayload ||
    Buffer.from(canonicalPayload, "utf8").toString("base64url") !== cursor
  ) {
    return null;
  }

  return {
    createdAt: payload.createdAt,
    id: payload.id,
  };
}

export function normalizeReadyMediaPageSize(pageSize?: number) {
  if (typeof pageSize !== "number" || !Number.isInteger(pageSize) || pageSize < 1) {
    return READY_MEDIA_PAGE_SIZE;
  }

  return Math.min(pageSize, MAX_READY_MEDIA_PAGE_SIZE);
}

export function createReadyMediaPage<TItem extends ReadyMediaCursorSource>(
  rows: TItem[],
  pageSize: number,
  getCursorSource: (item: TItem) => ReadyMediaCursorSource = (item) => item,
): ReadyMediaPage<TItem> {
  const items = rows.slice(0, pageSize);
  const lastItem = items.at(-1);

  return {
    items,
    nextCursor:
      rows.length > pageSize && lastItem
        ? encodeReadyMediaCursor(getCursorSource(lastItem))
        : null,
  };
}

function createReadyMediaCursorPayload({
  createdAt,
  id,
}: ReadyMediaCursorSource): ReadyMediaCursorPayload {
  if (!UUID_PATTERN.test(id)) {
    throw new Error("Ready media cursor id must be a canonical UUID.");
  }

  const isoCreatedAt = getCanonicalReadyMediaCreatedAt(createdAt);

  if (!isCanonicalIsoDate(isoCreatedAt)) {
    throw new Error("Ready media cursor createdAt must be a canonical ISO date.");
  }

  return {
    v: 1,
    createdAt: isoCreatedAt,
    id,
  };
}

function getCanonicalReadyMediaCreatedAt(createdAt: Date | string) {
  if (typeof createdAt === "string") {
    return createdAt;
  }

  if (Number.isNaN(createdAt.getTime())) {
    throw new Error("Ready media cursor createdAt must be a canonical ISO date.");
  }

  return createdAt.toISOString();
}

function isReadyMediaCursorPayload(
  payload: unknown,
): payload is ReadyMediaCursorPayload {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return false;
  }

  const keys = Object.keys(payload);

  if (keys.length !== 3 || keys[0] !== "v" || keys[1] !== "createdAt" || keys[2] !== "id") {
    return false;
  }

  const candidate = payload as Partial<ReadyMediaCursorPayload>;

  return (
    candidate.v === 1 &&
    typeof candidate.createdAt === "string" &&
    isCanonicalIsoDate(candidate.createdAt) &&
    typeof candidate.id === "string" &&
    UUID_PATTERN.test(candidate.id)
  );
}

function isCanonicalIsoDate(value: string) {
  if (!ISO_DATE_PATTERN.test(value)) {
    return false;
  }

  const millisecondValue = value.replace(/(\.\d{3})\d{3}Z$/, "$1Z");
  const date = new Date(value);

  return !Number.isNaN(date.getTime()) && date.toISOString() === millisecondValue;
}

function isValidCursorEnvelope(cursor: string) {
  return (
    cursor.length > 0 &&
    cursor.length <= MAX_CURSOR_LENGTH &&
    CURSOR_VALUE_PATTERN.test(cursor)
  );
}
