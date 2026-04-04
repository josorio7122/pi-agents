import { readdir } from "node:fs/promises";
import { join } from "node:path";

export async function scanForAgentFiles(directory: string) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => join(directory, entry.name));
  } catch {
    return [];
  }
}
