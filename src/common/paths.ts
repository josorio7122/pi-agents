import { homedir } from "node:os";

export function expandPath(filePath: string) {
  if (filePath === "~") return homedir();
  if (filePath.startsWith("~/")) return homedir() + filePath.slice(1);
  return filePath;
}
