const DEFAULT_INTERVAL_MS = 250;

export function createThrottle(fn: () => void, intervalMs = DEFAULT_INTERVAL_MS) {
  let lastCall = 0;
  let pending: ReturnType<typeof setTimeout> | undefined;

  const throttled = () => {
    const now = Date.now();
    const elapsed = now - lastCall;
    if (elapsed >= intervalMs) {
      lastCall = now;
      fn();
    } else if (!pending) {
      pending = setTimeout(() => {
        pending = undefined;
        lastCall = Date.now();
        fn();
      }, intervalMs - elapsed);
    }
  };

  throttled.flush = () => {
    if (pending) {
      clearTimeout(pending);
      pending = undefined;
    }
    fn();
  };

  return throttled;
}
