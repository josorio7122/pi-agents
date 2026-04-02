import { homedir } from "node:os";
import { resolve } from "node:path";

export function expandPath(filePath: string) {
  if (filePath === "~") return homedir();
  if (filePath.startsWith("~/")) return homedir() + filePath.slice(1);
  return filePath;
}

export function resolveConversationPath(params: {
  readonly template: string;
  readonly sessionId: string;
  readonly cwd: string;
}) {
  const resolved = params.template.replace("{{SESSION_ID}}", params.sessionId);
  return resolve(params.cwd, resolved);
}
