import { describe, expect, it } from "vitest";
import { extractFilePath } from "./params.js";

describe("extractFilePath", () => {
  it("extracts path from object with path field", () => {
    expect(extractFilePath({ path: "/tmp/a.txt" })).toBe("/tmp/a.txt");
  });

  it("extracts file_path when path is absent", () => {
    expect(extractFilePath({ file_path: "/tmp/b.txt" })).toBe("/tmp/b.txt");
  });

  it("prefers path over file_path", () => {
    expect(extractFilePath({ path: "/a", file_path: "/b" })).toBe("/a");
  });

  it("returns empty string for null", () => {
    expect(extractFilePath(null)).toBe("");
  });

  it("returns empty string for undefined", () => {
    expect(extractFilePath(undefined)).toBe("");
  });

  it("returns empty string for non-object", () => {
    expect(extractFilePath(42)).toBe("");
    expect(extractFilePath("string")).toBe("");
  });

  it("returns empty string when path is not a string", () => {
    expect(extractFilePath({ path: 123 })).toBe("");
  });

  it("returns empty string when file_path is not a string", () => {
    expect(extractFilePath({ file_path: 123 })).toBe("");
  });
});
