import { relative, resolve } from "node:path";
import type { DomainEntry } from "./types.js";

type Operation = "read" | "write" | "delete";

type CheckResult = { readonly allowed: true } | { readonly allowed: false; readonly reason: string };

export function checkDomain(params: {
  readonly filePath: string;
  readonly operation: Operation;
  readonly domain: ReadonlyArray<DomainEntry>;
  readonly cwd: string;
}): CheckResult {
  const { filePath, operation, domain, cwd } = params;

  const abs = resolve(cwd, filePath);
  const rel = relative(cwd, abs);

  function matchLength(entry: DomainEntry): number {
    if (entry.path === ".") return 0;
    const normalized = entry.path.endsWith("/") ? entry.path : `${entry.path}/`;
    const relWithSlash = rel.endsWith("/") ? rel : `${rel}/`;
    const prefixMatch = relWithSlash.startsWith(normalized);
    const exactMatch = rel === entry.path.replace(/\/$/, "");
    return prefixMatch || exactMatch ? normalized.length : -1;
  }

  const best = domain.reduce<{ entry: DomainEntry; length: number } | undefined>((acc, entry) => {
    const length = matchLength(entry);
    if (length < 0) return acc;
    if (!acc || length > acc.length) return { entry, length };
    return acc;
  }, undefined);

  if (!best) {
    return { allowed: false, reason: `Path "${rel}" is not in agent's domain` };
  }
  const bestMatch = best.entry;

  const permissionMap = { read: bestMatch.read, write: bestMatch.write, delete: bestMatch.delete };
  const permitted = permissionMap[operation];

  if (!permitted) {
    return { allowed: false, reason: `${operation} not permitted on "${rel}"` };
  }

  return { allowed: true };
}
