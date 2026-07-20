import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import {
  PartyrollBrand,
  PartyrollMark,
  PartyrollWordmark,
} from "./partyroll-brand";

describe("Partyroll brand primitives", () => {
  it("hides the mark when adjacent text supplies the accessible name", () => {
    const html = renderToStaticMarkup(<PartyrollBrand />);

    expect(html).toContain('aria-hidden="true"');
    expect(html).toContain("Partyroll");
    expect(html.match(/<svg/g)).toHaveLength(1);
    expect(html).toContain("fill:var(--brand-evergreen)");
  });

  it("supports an accessible standalone mark", () => {
    const html = renderToStaticMarkup(
      <PartyrollMark decorative={false} label="Partyroll" />,
    );

    expect(html).toContain('role="img"');
    expect(html).toContain('aria-label="Partyroll"');
    expect(html).not.toContain("aria-hidden");
  });

  it("keeps the wordmark text evergreen", () => {
    const html = renderToStaticMarkup(
      <PartyrollWordmark style={{ color: "hotpink" }} />,
    );

    expect(html).toContain("color:var(--brand-evergreen)");
    expect(html).not.toContain("hotpink");
  });

  it("keeps the mark evergreen", () => {
    const html = renderToStaticMarkup(
      <PartyrollMark style={{ fill: "hotpink" }} />,
    );

    expect(html).toContain("fill:var(--brand-evergreen)");
    expect(html).not.toContain("hotpink");
  });
});
