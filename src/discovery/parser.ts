import { extractFrontmatter } from "./extract-frontmatter.js";

type ParseResult =
  | { readonly ok: true; readonly value: { readonly frontmatter: Record<string, unknown>; readonly body: string } }
  | { readonly ok: false; readonly error: string };

/**
 * Compat alias for downstream consumers (e.g. pi-teams). Prefer `extractFrontmatter`
 * in new code — `validateAgent` already trims the body, so this trim is redundant.
 */
export function parseAgentFile(content: string): ParseResult {
  const extracted = extractFrontmatter(content);
  if (!extracted.ok) return extracted;

  const trimmedBody = extracted.value.body.trim();
  if (!trimmedBody) {
    return { ok: false, error: "Missing body — agent must have a system prompt below the frontmatter" };
  }

  return { ok: true, value: { frontmatter: extracted.value.frontmatter, body: trimmedBody } };
}
