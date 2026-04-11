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

  it("suppresses calls within the interval", () => {
    const fn = vi.fn();
    const throttled = createThrottle(fn, 100);
    throttled(); // immediate
    throttled(); // suppressed — schedules pending
    throttled(); // suppressed — pending already exists
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("deferred call fires after interval expires", () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const throttled = createThrottle(fn, 100);
      throttled(); // immediate, lastCall = 0 → now
      fn.mockClear();
      throttled(); // deferred — schedules setTimeout
      expect(fn).not.toHaveBeenCalled();
      vi.advanceTimersByTime(100);
      expect(fn).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("flush clears pending timer and calls immediately", () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const throttled = createThrottle(fn, 100);
      throttled(); // immediate
      fn.mockClear();
      throttled(); // deferred
      throttled.flush(); // should clear pending + call now
      expect(fn).toHaveBeenCalledTimes(1);
      // Advancing should NOT trigger the old pending
      vi.advanceTimersByTime(200);
      expect(fn).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("flush without pending still calls the function", () => {
    const fn = vi.fn();
    const throttled = createThrottle(fn, 100);
    throttled.flush();
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it("allows call after interval has elapsed", () => {
    vi.useFakeTimers();
    try {
      const fn = vi.fn();
      const throttled = createThrottle(fn, 100);
      throttled(); // immediate at t=0
      vi.advanceTimersByTime(100);
      throttled(); // should be immediate again at t=100
      expect(fn).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
