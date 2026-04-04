import { describe, expect, it } from "vitest";
import { buildDomainWithKnowledge } from "./scoped-tools.js";

describe("buildDomainWithKnowledge", () => {
  const baseDomain = [{ path: "apps/backend/", read: true, write: true, delete: true }];

  it("adds updatable knowledge paths as writable", () => {
    const result = buildDomainWithKnowledge({
      domain: baseDomain,
      knowledgeEntries: [
        { path: ".pi/knowledge/test.yaml", updatable: true },
        { path: "/home/user/.pi/agent/general/test.yaml", updatable: true },
      ],
    });

    expect(result).toHaveLength(3); // 1 base + 2 updatable knowledge
    expect(result.find((d) => d.path === ".pi/knowledge/test.yaml")?.write).toBe(true);
    expect(result.find((d) => d.path === "/home/user/.pi/agent/general/test.yaml")?.write).toBe(true);
  });

  it("adds non-updatable knowledge paths as read-only", () => {
    const result = buildDomainWithKnowledge({
      domain: baseDomain,
      knowledgeEntries: [{ path: ".pi/knowledge/test.yaml", updatable: false }],
    });

    const entry = result.find((d) => d.path === ".pi/knowledge/test.yaml");
    expect(entry?.read).toBe(true);
    expect(entry?.write).toBe(false);
  });

  it("preserves base domain entries", () => {
    const result = buildDomainWithKnowledge({
      domain: baseDomain,
      knowledgeEntries: [],
    });

    expect(result).toEqual(baseDomain);
  });

  it("adds updatable reports directory as writable", () => {
    const result = buildDomainWithKnowledge({
      domain: baseDomain,
      knowledgeEntries: [],
      reportsDir: { path: ".pi/reports", updatable: true },
    });

    const entry = result.find((d) => d.path === ".pi/reports");
    expect(entry?.read).toBe(true);
    expect(entry?.write).toBe(true);
    expect(entry?.delete).toBe(false);
  });

  it("adds non-updatable reports directory as read-only", () => {
    const result = buildDomainWithKnowledge({
      domain: baseDomain,
      knowledgeEntries: [],
      reportsDir: { path: ".pi/reports", updatable: false },
    });

    const entry = result.find((d) => d.path === ".pi/reports");
    expect(entry?.read).toBe(true);
    expect(entry?.write).toBe(false);
  });

  it("omits reports entry when reportsDir is undefined", () => {
    const result = buildDomainWithKnowledge({
      domain: baseDomain,
      knowledgeEntries: [],
    });

    expect(result).toEqual(baseDomain);
  });
});
