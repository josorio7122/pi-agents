import { parseFrontmatter } from "@mariozechner/pi-coding-agent";

type ParseResult =
  | { readonly ok: true; readonly value: { readonly frontmatter: Record<string, unknown>; readonly body: string } }
  | { readonly ok: false; readonly error: string };

export function parseAgentFile(content: string): ParseResult {
  if (!content.trim()) {
    return { ok: false, error: "Empty file" };
  }

  if (!content.trimStart().startsWith("---")) {
    return { ok: false, error: "Missing frontmatter — file must start with ---" };
  }

  const { frontmatter, body } = parseFrontmatter(content);

  if (Object.keys(frontmatter).length === 0) {
    return { ok: false, error: "Missing frontmatter — no YAML fields found" };
  }

  const trimmedBody = body.trim();
  if (!trimmedBody) {
    return { ok: false, error: "Missing body — agent must have a system prompt below the frontmatter" };
  }

  return { ok: true, value: { frontmatter, body: trimmedBody } };
}
