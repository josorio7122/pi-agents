import { readFile } from "node:fs/promises";
import { expandPath } from "./paths.js";

export async function readFileSafe(filePath: string) {
  try {
    return await readFile(expandPath(filePath), "utf-8");
  } catch {
    return "";
  }
}
