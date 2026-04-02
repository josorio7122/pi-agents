import { DEFAULT_MAX_BYTES, DEFAULT_MAX_LINES, truncateHead } from "@mariozechner/pi-coding-agent";

export function truncateOutput(text: string) {
  const t = truncateHead(text, { maxLines: DEFAULT_MAX_LINES, maxBytes: DEFAULT_MAX_BYTES });
  return t.truncated ? `${t.content}\n\n[Output truncated: ${t.outputLines}/${t.totalLines} lines]` : text;
}
