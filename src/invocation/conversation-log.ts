import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

type ConversationEntry = Readonly<{
  ts: string;
  from: string;
  to: string;
  message: string;
  type?: string;
}>;

export function ensureLogExists(logPath: string) {
  if (existsSync(logPath)) return;
  mkdirSync(dirname(logPath), { recursive: true });
  writeFileSync(logPath, "", "utf-8");
}

export function appendToLog(logPath: string, entry: ConversationEntry) {
  appendFileSync(logPath, `${JSON.stringify(entry)}\n`, "utf-8");
}

export function readLog(logPath: string) {
  if (!existsSync(logPath)) return "";
  return readFileSync(logPath, "utf-8");
}
