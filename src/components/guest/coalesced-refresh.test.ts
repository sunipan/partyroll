import { afterEach, describe, expect, it, vi } from "vitest";

import { createCoalescedRefresh } from "./coalesced-refresh";

describe("createCoalescedRefresh", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("coalesces repeated refresh requests into one callback", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const coalesced = createCoalescedRefresh(refresh, 250);

    coalesced.schedule();
    coalesced.schedule();
    coalesced.schedule();
    vi.advanceTimersByTime(249);
    expect(refresh).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("can cancel a pending refresh", () => {
    vi.useFakeTimers();
    const refresh = vi.fn();
    const coalesced = createCoalescedRefresh(refresh, 250);

    coalesced.schedule();
    coalesced.cancel();
    vi.advanceTimersByTime(250);

    expect(refresh).not.toHaveBeenCalled();
  });
});
