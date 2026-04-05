import { describe, expect, it } from "vitest";
import { truncateOutput } from "./truncate.js";

describe("truncateOutput", () => {
  it("returns short text unchanged", () => {
    const text = "line 1\nline 2\nline 3";
    expect(truncateOutput(text)).toBe(text);
  });

  it("truncates text exceeding max lines and appends notice", () => {
    const lines = Array.from({ length: 3000 }, (_, i) => `line ${i + 1}`);
    const result = truncateOutput(lines.join("\n"));
    expect(result).toContain("[Output truncated:");
    expect(result).toContain("/3000 lines]");
    expect(result).not.toContain("line 3000");
  });
});
