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

  // Normalize to relative path
  const abs = resolve(cwd, filePath);
  const rel = relative(cwd, abs);

  // Find most specific matching domain entry (longest prefix)
  let bestMatch: DomainEntry | undefined;
  let bestLength = -1;

  for (const entry of domain) {
    // "." matches all paths (wildcard) — lowest specificity
    if (entry.path === ".") {
      if (bestLength < 0) {
        bestLength = 0;
        bestMatch = entry;
      }
      continue;
    }

    const normalized = entry.path.endsWith("/") ? entry.path : `${entry.path}/`;
    const relWithSlash = rel.endsWith("/") ? rel : `${rel}/`;

    if (relWithSlash.startsWith(normalized) || rel === entry.path.replace(/\/$/, "")) {
      if (normalized.length > bestLength) {
        bestLength = normalized.length;
        bestMatch = entry;
      }
    }
  }

  if (!bestMatch) {
    return { allowed: false, reason: `Path "${rel}" is not in agent's domain` };
  }

  const permissionMap = { read: bestMatch.read, write: bestMatch.write, delete: bestMatch.delete };
  const permitted = permissionMap[operation];

  if (!permitted) {
    return { allowed: false, reason: `${operation} not permitted on "${rel}"` };
  }

  return { allowed: true };
}
