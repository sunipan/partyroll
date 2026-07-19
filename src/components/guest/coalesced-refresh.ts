export type CoalescedRefresh = {
  schedule: () => void;
  cancel: () => void;
  flush: () => void;
};

export function createCoalescedRefresh(
  refresh: () => void,
  delayMilliseconds = 250,
): CoalescedRefresh {
  let timeout: ReturnType<typeof setTimeout> | null = null;

  function cancel() {
    if (timeout === null) {
      return;
    }

    clearTimeout(timeout);
    timeout = null;
  }

  return {
    schedule() {
      if (timeout !== null) {
        return;
      }

      timeout = setTimeout(() => {
        timeout = null;
        refresh();
      }, delayMilliseconds);
    },
    cancel,
    flush() {
      if (timeout === null) {
        return;
      }

      cancel();
      refresh();
    },
  };
}
