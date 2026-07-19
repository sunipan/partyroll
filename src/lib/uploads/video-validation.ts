import "server-only";

import { InvalidUploadError } from "./objects";
import type { SupportedVideoMimeType } from "./rules";

const MP4_COMPATIBLE_MIME_TYPES = new Set<SupportedVideoMimeType>([
  "video/mp4",
  "video/quicktime",
]);

export function validateUploadedVideo({
  prefix,
  mimeType,
  byteSize,
}: {
  prefix: Buffer;
  mimeType: SupportedVideoMimeType;
  byteSize: number;
}) {
  if (byteSize <= 0 || prefix.byteLength <= 0) {
    throw new InvalidUploadError("The uploaded video is empty.");
  }

  if (MP4_COMPATIBLE_MIME_TYPES.has(mimeType)) {
    validateMp4Compatible(prefix);
    return;
  }

  if (mimeType === "video/webm") {
    validateWebm(prefix);
    return;
  }

  throw new InvalidUploadError("The video type is unsupported.");
}

function validateMp4Compatible(prefix: Buffer) {
  if (prefix.byteLength < 12) {
    throw new InvalidUploadError("The video container is incomplete.");
  }

  let offset = 0;
  let sawFtyp = false;
  let sawMediaBox = false;

  while (offset + 8 <= prefix.byteLength && offset < 1024 * 1024) {
    const size32 = prefix.readUInt32BE(offset);
    const type = prefix.toString("ascii", offset + 4, offset + 8);
    let headerSize = 8;
    let size = size32;

    if (size32 === 1) {
      if (offset + 16 > prefix.byteLength) {
        break;
      }
      size = Number(prefix.readBigUInt64BE(offset + 8));
      headerSize = 16;
    } else if (size32 === 0) {
      size = prefix.byteLength - offset;
    }

    if (size < headerSize || offset + headerSize > prefix.byteLength) {
      throw new InvalidUploadError("The video container is malformed.");
    }

    if (type === "ftyp") {
      sawFtyp = true;
    }
    if (type === "moov" || type === "mdat") {
      sawMediaBox = true;
    }

    if (sawFtyp && sawMediaBox) {
      return;
    }

    if (size === 0 || offset + size > prefix.byteLength) {
      break;
    }
    offset += size;
  }

  throw new InvalidUploadError("The video container is not supported.");
}

function validateWebm(prefix: Buffer) {
  const ebmlMagic = Buffer.from([0x1a, 0x45, 0xdf, 0xa3]);
  const docType = Buffer.from("webm", "ascii");
  if (prefix.indexOf(ebmlMagic) !== 0 || prefix.indexOf(docType) === -1) {
    throw new InvalidUploadError("The video container is not supported.");
  }
}
