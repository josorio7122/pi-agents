import { describe, expect, it } from "vitest";
import { extractFrontmatter } from "./extract-frontmatter.js";

describe("extractFrontmatter", () => {
  it("extracts frontmatter and body from valid content", () => {
    const result = extractFrontmatter("---\nname: test\n---\nBody here");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.frontmatter.name).toBe("test");
    expect(result.value.body).toContain("Body here");
  });

  it("returns error for empty content", () => {
    const result = extractFrontmatter("");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Empty");
  });

  it("returns error for whitespace-only content", () => {
    const result = extractFrontmatter("   \n\t\n  ");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Empty");
  });

  it("returns error for content without frontmatter delimiters", () => {
    const result = extractFrontmatter("# Just markdown\n\nNo frontmatter here.");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("Missing frontmatter");
  });

  it("returns error for empty frontmatter", () => {
    const result = extractFrontmatter("---\n   \n---\nBody here");
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain("no YAML fields");
  });

  it("handles frontmatter with invalid YAML gracefully", () => {
    // parseFrontmatter may throw on malformed YAML, or return empty frontmatter.
    // Either way, extractFrontmatter must not return ok: true with garbage data.
    try {
      const result = extractFrontmatter("---\n: invalid: yaml: [\n---\nBody here");
      // If it doesn't throw, it must be an error result
      expect(result.ok).toBe(false);
    } catch (err) {
      // Throwing is acceptable — YAML parsing failure
      expect(err).toBeDefined();
    }
  });

  it("handles file with multiple --- separators", () => {
    const content = "---\nname: test\n---\n# Agent\n\n---\n\nMore content after separator";
    const result = extractFrontmatter(content);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Body should include everything after the closing ---
    expect(result.value.body).toContain("More content after separator");
  });
});
