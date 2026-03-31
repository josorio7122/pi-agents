import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

export function scanForAgentFiles(directory: string) {
  if (!existsSync(directory)) return [];

  return readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
    .map((entry) => join(directory, entry.name));
}
