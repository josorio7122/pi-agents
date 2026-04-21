import type { AgentFrontmatter } from "../schema/frontmatter.js";
import { AgentFrontmatterSchema } from "../schema/frontmatter.js";
import { safeParse } from "../schema/parse.js";
import { validateRoleTools } from "../schema/validation.js";

export type AgentConfig = Readonly<{
  frontmatter: AgentFrontmatter;
  systemPrompt: string;
  filePath: string;
  source: "project" | "user";
}>;

export type DiscoveryDiagnostic = Readonly<{
  level: "error" | "warning";
  filePath: string;
  message: string;
}>;

type ValidateResult =
  | { readonly ok: true; readonly value: AgentConfig }
  | { readonly ok: false; readonly errors: ReadonlyArray<DiscoveryDiagnostic> };

export function validateAgent(params: {
  readonly frontmatter: unknown;
  readonly body: string;
  readonly filePath: string;
  readonly source: "project" | "user";
}): ValidateResult {
  const diagnostics: DiscoveryDiagnostic[] = [];

  // Validate frontmatter against the typebox schema
  const parsed = safeParse(AgentFrontmatterSchema, params.frontmatter);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      diagnostics.push({
        level: "error",
        filePath: params.filePath,
        message: `${issue.path.join(".")}: ${issue.message}`,
      });
    }
    return { ok: false, errors: diagnostics };
  }

  // Validate system prompt body is non-empty
  const trimmedBody = params.body.trim();
  if (!trimmedBody) {
    diagnostics.push({
      level: "error",
      filePath: params.filePath,
      message: "Missing system prompt body — agent must have instructions below the frontmatter",
    });
    return { ok: false, errors: diagnostics };
  }

  // Cross-field: role-tool validation
  const roleToolErrors = validateRoleTools(parsed.data.role, parsed.data.tools);
  if (roleToolErrors.length > 0) {
    for (const msg of roleToolErrors) {
      diagnostics.push({ level: "error", filePath: params.filePath, message: msg });
    }
    return { ok: false, errors: diagnostics };
  }

  return {
    ok: true,
    value: {
      frontmatter: parsed.data,
      systemPrompt: trimmedBody,
      filePath: params.filePath,
      source: params.source,
    },
  };
}
