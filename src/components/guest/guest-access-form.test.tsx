import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { GuestAccessForm } from "./guest-access-form";

describe("GuestAccessForm", () => {
  it("shows the concrete gallery code example with accessible form semantics", () => {
    const html = renderToStaticMarkup(<GuestAccessForm />);

    expect(html).toContain('placeholder="RENEE-SEBI-K7M4Q9"');
    expect(html).not.toContain("&lt;code&gt;");
    expect(html).toMatch(
      /<label[^>]+for="gallery-code"[^>]*>Gallery code<\/label>/,
    );
    expect(html).toContain('name="code"');
    expect(html).toContain('aria-describedby="gallery-code-help"');
  });
});
