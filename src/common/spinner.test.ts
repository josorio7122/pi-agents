import { describe, expect, it, vi } from "vitest";
import { SPINNER_FRAMES, spinnerFrame } from "./spinner.js";

describe("SPINNER_FRAMES", () => {
  it("contains 10 braille frames", () => {
    expect(SPINNER_FRAMES).toHaveLength(10);
    expect(SPINNER_FRAMES[0]).toBe("\u280B");
  });
});

describe("spinnerFrame", () => {
  it("returns a frame from the array based on time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const frame = spinnerFrame();
    expect(SPINNER_FRAMES).toContain(frame);
    vi.useRealTimers();
  });

  it("cycles through frames at 80ms intervals", () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    const first = spinnerFrame();
    vi.setSystemTime(80);
    const second = spinnerFrame();
    expect(first).not.toBe(second);
    vi.useRealTimers();
  });
});
