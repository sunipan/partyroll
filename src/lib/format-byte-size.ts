const KIBIBYTE = 1024;
const MEBIBYTE = KIBIBYTE * 1024;
const MEBIBYTE_DISPLAY_THRESHOLD = 100 * KIBIBYTE;

const byteSizeNumberFormatter = new Intl.NumberFormat("en", {
  maximumFractionDigits: 1,
});

export function formatByteSize(bytes: number) {
  if (bytes < KIBIBYTE) {
    return `${byteSizeNumberFormatter.format(bytes)} B`;
  }
  if (bytes < MEBIBYTE_DISPLAY_THRESHOLD) {
    return `${byteSizeNumberFormatter.format(bytes / KIBIBYTE)} KB`;
  }
  return `${byteSizeNumberFormatter.format(bytes / MEBIBYTE)} MB`;
}
