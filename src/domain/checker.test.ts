import { describe, expect, it } from "vitest";
import { checkDomain } from "./checker.js";

const domain = [
  { path: "apps/backend/", read: true, write: true, delete: true },
  { path: "apps/frontend/", read: true, write: false, delete: false },
];

const cwd = "/project";

describe("checkDomain", () => {
  it("allows read on readable domain", () => {
    expect(checkDomain({ filePath: "apps/backend/src/index.ts", operation: "read", domain, cwd })).toEqual({
      allowed: true,
    });
  });

  it("allows write on writable domain", () => {
    expect(checkDomain({ filePath: "apps/backend/src/index.ts", operation: "write", domain, cwd })).toEqual({
      allowed: true,
    });
  });

  it("allows read on read-only domain", () => {
    expect(checkDomain({ filePath: "apps/frontend/src/app.tsx", operation: "read", domain, cwd })).toEqual({
      allowed: true,
    });
  });

  it("blocks write on read-only domain", () => {
    const result = checkDomain({ filePath: "apps/frontend/src/app.tsx", operation: "write", domain, cwd });
    expect(result.allowed).toBe(false);
  });

  it("blocks delete on no-delete domain", () => {
    const result = checkDomain({ filePath: "apps/frontend/src/app.tsx", operation: "delete", domain, cwd });
    expect(result.allowed).toBe(false);
  });

  it("blocks paths not in any domain", () => {
    const result = checkDomain({ filePath: "config/secrets.yaml", operation: "read", domain, cwd });
    expect(result.allowed).toBe(false);
  });

  it("matches most specific domain (longest prefix)", () => {
    const specificDomain = [
      { path: "apps/", read: true, write: false, delete: false },
      { path: "apps/backend/", read: true, write: true, delete: true },
    ];

    const result = checkDomain({
      filePath: "apps/backend/src/index.ts",
      operation: "write",
      domain: specificDomain,
      cwd,
    });
    expect(result.allowed).toBe(true);
  });

  it("resolves absolute paths relative to cwd", () => {
    const result = checkDomain({ filePath: "/project/apps/backend/index.ts", operation: "read", domain, cwd });
    expect(result.allowed).toBe(true);
  });

  it("handles trailing slash normalization", () => {
    const noSlashDomain = [{ path: "apps/backend", read: true, write: true, delete: true }];
    const result = checkDomain({ filePath: "apps/backend/index.ts", operation: "read", domain: noSlashDomain, cwd });
    expect(result.allowed).toBe(true);
  });

  it("treats '.' as wildcard matching all paths", () => {
    const wildcardDomain = [{ path: ".", read: true, write: true, delete: false }];
    expect(checkDomain({ filePath: "src/index.ts", operation: "read", domain: wildcardDomain, cwd })).toEqual({
      allowed: true,
    });
    expect(checkDomain({ filePath: "package.json", operation: "write", domain: wildcardDomain, cwd })).toEqual({
      allowed: true,
    });
    expect(checkDomain({ filePath: "deep/nested/file.ts", operation: "read", domain: wildcardDomain, cwd })).toEqual({
      allowed: true,
    });
    const deleteResult = checkDomain({ filePath: "src/foo.ts", operation: "delete", domain: wildcardDomain, cwd });
    expect(deleteResult.allowed).toBe(false);
  });

  it("more specific domain overrides '.' wildcard", () => {
    const mixedDomain = [
      { path: ".", read: true, write: false, delete: false },
      { path: "src/", read: true, write: true, delete: true },
    ];
    expect(checkDomain({ filePath: "src/index.ts", operation: "write", domain: mixedDomain, cwd })).toEqual({
      allowed: true,
    });
    const rootWrite = checkDomain({ filePath: "package.json", operation: "write", domain: mixedDomain, cwd });
    expect(rootWrite.allowed).toBe(false);
  });
});
