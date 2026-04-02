import { describe, expect, it, vi } from "vitest";
import { createThrottle } from "./throttle.js";

describe("createThrottle", () => {
  it("calls immediately on first invocation", () => {
    const fn = vi.fn();
    const throttled = createThrottle(fn, 100);
    throttled();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("flush always calls the function", () => {
    const fn = vi.fn();
    const throttled = createThrottle(fn, 100);
    throttled();
    throttled.flush();
    expect(fn).toHaveBeenCalledTimes(2);
  });
});
