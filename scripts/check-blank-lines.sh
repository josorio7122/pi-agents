#!/usr/bin/env bash
# Enforce one blank line between consecutive multi-line code blocks at the same
# scope. Biome 2.4.x has no equivalent of ESLint's padding-line-between-statements;
# this script fills the gap. Runs as part of `npm run check`.
#
# Flags when a closing line (`}`, `};`, `});`, `]`, `];`, `]);`) at indent X is
# followed IMMEDIATELY (no blank) by a line at the SAME indent X that opens a
# new multi-line block (ends with `{` or `(`).

set -uo pipefail

violations=$(find src -name "*.ts" -print0 | xargs -0 awk '
  function indent_of(s) { match(s, /^[ \t]*/); return RLENGTH }
  # Reset per-file state so violations never cross file boundaries.
  FNR == 1 { prev_close = 0; prev_line = ""; prev_indent = -1 }
  {
    cur_indent = indent_of($0)
    trimmed = substr($0, cur_indent + 1)
    is_close = (trimmed ~ /^(\}|\})\)?;?$/ || trimmed ~ /^(\]|\])\)?;?$/)
    is_block_start = (trimmed ~ /\{[ ]*$/ || trimmed ~ /\([ ]*$/)
    is_decl_line = (trimmed ~ /^(function |const |let |type |interface |class |async |export (function|const|let|type|class|async|interface|default)|it\(|describe\(|test\(|before|after)/)
    if (is_block_start && is_decl_line && prev_close && prev_indent == cur_indent) {
      printf "%s:%d — missing blank line between multi-line blocks\n  prev: %s\n  curr: %s\n", FILENAME, FNR, prev_line, $0
    }
    prev_close = is_close
    prev_indent = cur_indent
    prev_line = $0
  }
')

if [ -n "$violations" ]; then
  printf "%s\n" "$violations"
  exit 1
fi
