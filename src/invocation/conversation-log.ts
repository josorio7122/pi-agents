import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import type { ConversationEntry } from "../schema/conversation.js";

export async function ensureLogExists(logPath: string) {
  try {
    await access(logPath);
  } catch {
    await mkdir(dirname(logPath), { recursive: true });
    await writeFile(logPath, "", "utf-8");
  }
}

export async function appendToLog(logPath: string, entry: ConversationEntry) {
  await ensureLogExists(logPath);
  await appendFile(logPath, `${JSON.stringify(entry)}\n`, "utf-8");
}

export async function readLog(logPath: string) {
  try {
    return await readFile(logPath, "utf-8");
  } catch {
    return "";
  }
}
