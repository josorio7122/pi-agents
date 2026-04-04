import { readFile, writeFile } from "node:fs/promises";

export async function enforceMaxLines(params: { readonly filePath: string; readonly maxLines: number }) {
  let content: string;
  try {
    content = await readFile(params.filePath, "utf-8");
  } catch {
    return false;
  }

  const lines = content.split("\n");

  // Remove trailing empty line from split (file ends with \n)
  if (lines.length > 0 && lines[lines.length - 1] === "") {
    lines.pop();
  }

  if (lines.length <= params.maxLines) return false;

  // Keep last maxLines lines (newest entries at bottom)
  const kept = lines.slice(-params.maxLines);
  await writeFile(params.filePath, `${kept.join("\n")}\n`, "utf-8");
  return true;
}
