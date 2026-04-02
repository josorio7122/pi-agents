import { describe, expect, it } from "vitest";
import { colorize } from "./color.js";

describe("colorize", () => {
  it("wraps text in 24-bit ANSI color escape", () => {
    const result = colorize("#ff0000", "hello");
    expect(result).toBe("\x1b[38;2;255;0;0mhello\x1b[39m");
  });

  it("parses hex correctly", () => {
    const result = colorize("#61dafb", "react");
    expect(result).toBe("\x1b[38;2;97;218;251mreact\x1b[39m");
  });

  it("returns plain text for invalid hex", () => {
    expect(colorize("not-hex", "text")).toBe("text");
    expect(colorize("", "text")).toBe("text");
    expect(colorize("#zz0000", "text")).toBe("text");
  });
});
