import { existsSync, readFileSync, writeFileSync } from "node:fs";

export function enforceMaxLines(params: { readonly filePath: string; readonly maxLines: number }) {
  if (!existsSync(params.filePath)) return false;

  const content = readFileSync(params.filePath, "utf-8");
  const lines = content.split("\n");

  // Remove trailing empty line from split (file ends with \n)
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  if (lines.length <= params.maxLines) return false;

  // Keep last maxLines lines (newest entries at bottom)
  const kept = lines.slice(-params.maxLines);
  writeFileSync(params.filePath, `${kept.join("\n")}\n`, "utf-8");
  return true;
}
