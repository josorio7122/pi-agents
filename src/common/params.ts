import { isRecord } from "./type-guards.js";

export function extractFilePath(params: unknown): string {
  if (!isRecord(params)) return "";
  const raw = params.path ?? params.file_path ?? "";
  return typeof raw === "string" ? raw : "";
}
