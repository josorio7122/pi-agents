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
});
