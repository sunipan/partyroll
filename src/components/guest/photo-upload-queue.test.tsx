import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { UploadItemProgress } from "./photo-upload-queue";

describe("UploadItemProgress", () => {
  it("renders terminal upload progress as visually and semantically complete", () => {
    const html = renderToStaticMarkup(
      <UploadItemProgress
        fileName="finished-photo.jpg"
        status="ready"
        progress={95}
      />,
    );

    expect(html).toContain('aria-valuenow="100"');
    expect(html).toContain('aria-valuetext="100%"');
    expect(html).toContain("data-complete");
    expect(html).toContain("width:100%");
    expect(html).toContain("overflow-hidden");
    expect(html).not.toContain("overflow-x-hidden");
  });

  it("preserves intermediate upload progress", () => {
    const html = renderToStaticMarkup(
      <UploadItemProgress
        fileName="uploading-photo.jpg"
        status="uploading"
        progress={42}
      />,
    );

    expect(html).toContain('aria-valuenow="42"');
    expect(html).toContain('aria-valuetext="42%"');
    expect(html).toContain("data-progressing");
    expect(html).toContain("width:42%");
    expect(html).not.toContain("data-complete");
  });
});
