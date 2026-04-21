// This module is the documented exception to AGENTS.md's "no raw ANSI escapes
// in production code" rule. Pi's Theme.fg only exposes named color slots
// (accent/muted/dim/text/success/error/warning); true-color hex values — used
// by agents to render their own brand colors — require emitting the 24-bit
// ANSI escape directly. This is the ONLY place in `src/` that constructs
// `\x1b[...]` sequences. Do not add more raw ANSI elsewhere.
const HEX_PATTERN = /^#[0-9a-fA-F]{6}$/;

export function colorize(hex: string, text: string) {
  if (!HEX_PATTERN.test(hex)) return text;
  const r = Number.parseInt(hex.slice(1, 3), 16);
  const g = Number.parseInt(hex.slice(3, 5), 16);
  const b = Number.parseInt(hex.slice(5, 7), 16);
  return `\x1b[38;2;${r};${g};${b}m${text}\x1b[39m`;
}
