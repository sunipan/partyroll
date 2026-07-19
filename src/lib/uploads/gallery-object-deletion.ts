import "server-only";

import { DeleteObjectsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

import { r2, r2Bucket } from "@/lib/r2";

const R2_TIMEOUT_MS = 30_000;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export const GALLERY_OBJECT_LIST_PAGE_SIZE = 1_000;
export const GALLERY_OBJECT_DELETE_BATCH_SIZE = 1_000;
export const GALLERY_OBJECT_MAX_LIST_REQUESTS = 25;
export const GALLERY_OBJECT_MAX_DELETE_BATCHES = 25;
export const DEFAULT_GALLERY_OBJECT_DELETION_BUDGET = {
  listPageSize: GALLERY_OBJECT_LIST_PAGE_SIZE,
  deleteBatchSize: GALLERY_OBJECT_DELETE_BATCH_SIZE,
  maxListRequests: 3,
  maxDeleteBatches: 3,
} as const;

export type GalleryObjectPrefixName = "quarantine" | "originals" | "photos";
export type GalleryObjectDeletionCursor = { prefixIndex: number };
export type GalleryObjectDeletionBudget = {
  listPageSize?: number;
  deleteBatchSize?: number;
  maxListRequests?: number;
  maxDeleteBatches?: number;
};
export type GalleryObjectDeletionFailure =
  | { phase: "list"; prefix: GalleryObjectPrefixName; errorName: string }
  | {
      phase: "delete";
      prefix: GalleryObjectPrefixName;
      errorName: string;
      objectErrorCount?: number;
      errorCodes?: { code: string; count: number }[];
    };
export type GalleryObjectDeletionResult = {
  status: "complete" | "bounded" | "retryable-error";
  converged: boolean;
  discovered: number;
  deleted: number;
  duplicates: number;
  remaining: number | null;
  cursor: GalleryObjectDeletionCursor | null;
  listRequests: number;
  deleteBatches: number;
  failure: GalleryObjectDeletionFailure | null;
};

type PrefixDescriptor = { name: GalleryObjectPrefixName; value: string };
type Progress = Pick<
  GalleryObjectDeletionResult,
  "discovered" | "deleted" | "duplicates" | "listRequests" | "deleteBatches"
>;
type NormalizedBudget = Required<GalleryObjectDeletionBudget>;
type ObjectError = { Key?: string; Code?: string };

export function getGalleryObjectPrefixes(galleryId: string): PrefixDescriptor[] {
  if (!UUID_RE.test(galleryId)) {
    throw new Error("Gallery object deletion requires a canonical gallery UUID.");
  }

  return [
    { name: "quarantine", value: `quarantine/${galleryId}/` },
    { name: "originals", value: `originals/${galleryId}/` },
    { name: "photos", value: `photos/${galleryId}/` },
  ];
}

export async function deleteGalleryObjects({
  galleryId,
  cursor = null,
  budget,
}: {
  galleryId: string;
  cursor?: GalleryObjectDeletionCursor | null;
  budget?: GalleryObjectDeletionBudget;
}): Promise<GalleryObjectDeletionResult> {
  const prefixes = getGalleryObjectPrefixes(galleryId);
  const limits = normalizeBudget(budget);
  let prefixIndex = normalizeCursor(cursor, prefixes.length);
  const progress: Progress = { discovered: 0, deleted: 0, duplicates: 0, listRequests: 0, deleteBatches: 0 };
  const seenKeys = new Set<string>();

  while (prefixIndex < prefixes.length) {
    if (progress.listRequests >= limits.maxListRequests) {
      return finish(progress, "bounded", prefixIndex);
    }

    const prefix = prefixes[prefixIndex];
    let page: Awaited<ReturnType<typeof listObjectPage>>;
    try {
      page = await listObjectPage(prefix, limits.listPageSize);
    } catch (error) {
      return finish(progress, "retryable-error", prefixIndex, {
        phase: "list",
        prefix: prefix.name,
        errorName: errorName(error),
      });
    }
    progress.listRequests += 1;

    const keys: string[] = [];
    for (const object of page.Contents ?? []) {
      const key = object.Key;
      if (!key?.startsWith(prefix.value)) continue;
      if (seenKeys.has(key)) {
        progress.duplicates += 1;
        continue;
      }
      seenKeys.add(key);
      progress.discovered += 1;
      keys.push(key);
    }

    if (keys.length === 0) {
      if (page.IsTruncated) return finish(progress, "bounded", prefixIndex);
      prefixIndex += 1;
      continue;
    }

    for (let start = 0; start < keys.length; start += limits.deleteBatchSize) {
      if (progress.deleteBatches >= limits.maxDeleteBatches) {
        return finish(progress, "bounded", prefixIndex);
      }

      const batch = keys.slice(start, start + limits.deleteBatchSize);
      let deleteOutput: Awaited<ReturnType<typeof deleteObjectBatch>>;
      try {
        deleteOutput = await deleteObjectBatch(batch);
      } catch (error) {
        return finish(progress, "retryable-error", prefixIndex, {
          phase: "delete",
          prefix: prefix.name,
          errorName: errorName(error),
        });
      }
      progress.deleteBatches += 1;

      const objectErrors = (deleteOutput.Errors ?? []).filter(isRetriableObjectError);
      if (objectErrors.length > 0) {
        const failedKeys = new Set(
          objectErrors
            .map((error) => error.Key)
            .filter(
              (key): key is string =>
                typeof key === "string" && batch.includes(key),
            ),
        );
        const unknownKeyErrors = objectErrors.filter(
          (error) => !error.Key || !batch.includes(error.Key),
        ).length;
        progress.deleted += Math.max(0, batch.length - failedKeys.size - unknownKeyErrors);
        return finish(progress, "retryable-error", prefixIndex, {
          phase: "delete",
          prefix: prefix.name,
          errorName: "R2ObjectError",
          objectErrorCount: objectErrors.length,
          errorCodes: countErrorCodes(objectErrors),
        });
      }

      progress.deleted += batch.length;
    }

    // Re-list the same exact prefix after successful deletes. We intentionally do
    // not persist S3 continuation tokens across mutations, so retries cannot skip
    // failed or late-written gallery keys.
  }

  return finish(progress, "complete", prefixes.length);
}

function listObjectPage(prefix: PrefixDescriptor, maxKeys: number) {
  return withR2Timeout((abortSignal) =>
    r2.send(
      new ListObjectsV2Command({ Bucket: r2Bucket, Prefix: prefix.value, MaxKeys: maxKeys }),
      { abortSignal },
    ),
  );
}

function deleteObjectBatch(keys: string[]) {
  return withR2Timeout((abortSignal) =>
    r2.send(
      new DeleteObjectsCommand({
        Bucket: r2Bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
      { abortSignal },
    ),
  );
}

async function withR2Timeout<T>(operation: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error("R2 operation timed out.")), R2_TIMEOUT_MS);
  try {
    return await operation(controller.signal);
  } finally {
    clearTimeout(timeout);
  }
}

function finish(
  progress: Progress,
  status: GalleryObjectDeletionResult["status"],
  prefixIndex: number,
  failure: GalleryObjectDeletionFailure | null = null,
): GalleryObjectDeletionResult {
  return {
    ...progress,
    status,
    converged: status === "complete",
    remaining: status === "complete" ? 0 : null,
    cursor: status === "complete" ? null : { prefixIndex },
    failure,
  };
}

function normalizeBudget(budget: GalleryObjectDeletionBudget | undefined): NormalizedBudget {
  return {
    listPageSize: boundedInteger(budget?.listPageSize, GALLERY_OBJECT_LIST_PAGE_SIZE, GALLERY_OBJECT_LIST_PAGE_SIZE, "list page size"),
    deleteBatchSize: boundedInteger(budget?.deleteBatchSize, GALLERY_OBJECT_DELETE_BATCH_SIZE, GALLERY_OBJECT_DELETE_BATCH_SIZE, "delete batch size"),
    maxListRequests: boundedInteger(budget?.maxListRequests, DEFAULT_GALLERY_OBJECT_DELETION_BUDGET.maxListRequests, GALLERY_OBJECT_MAX_LIST_REQUESTS, "max list requests"),
    maxDeleteBatches: boundedInteger(budget?.maxDeleteBatches, DEFAULT_GALLERY_OBJECT_DELETION_BUDGET.maxDeleteBatches, GALLERY_OBJECT_MAX_DELETE_BATCHES, "max delete batches"),
  };
}

function boundedInteger(value: number | undefined, fallback: number, max: number, label: string) {
  const candidate = value ?? fallback;
  if (!Number.isInteger(candidate) || candidate < 1) {
    throw new Error(`Gallery object deletion ${label} must be a positive integer.`);
  }
  return Math.min(candidate, max);
}

function normalizeCursor(cursor: GalleryObjectDeletionCursor | null, prefixCount: number) {
  if (!cursor) return 0;
  if (!Number.isInteger(cursor.prefixIndex) || cursor.prefixIndex < 0 || cursor.prefixIndex > prefixCount) {
    throw new Error("Gallery object deletion cursor is invalid.");
  }
  return cursor.prefixIndex;
}

function isRetriableObjectError(error: ObjectError) {
  return error.Code !== "NoSuchKey" && error.Code !== "NotFound";
}

function countErrorCodes(errors: ObjectError[]) {
  const counts = new Map<string, number>();
  for (const error of errors) {
    const code = error.Code?.trim() || "Unknown";
    counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  return [...counts.entries()].map(([code, count]) => ({ code, count }));
}

function errorName(error: unknown) {
  return error instanceof Error ? error.name : "R2Error";
}
