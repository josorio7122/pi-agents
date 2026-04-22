// Public API for pi-agents
// Curated surface for consumers (e.g. pi-teams). Not a barrel — only intentional exports.

// biome-ignore-start lint/performance/noBarrelFile: api.ts is the designated public surface
export { colorize } from "./common/color.js";
export type { ContextFile } from "./common/context-files.js";
export { discoverContextFiles } from "./common/context-files.js";
export { readFileSafe } from "./common/fs.js";
export { parseModelId } from "./common/model.js";
export { expandPath } from "./common/paths.js";
export { ANIMATION_FRAME_MS, spinnerFrame, workingDots } from "./common/spinner.js";
export { flatten } from "./common/strings.js";
export { isRecord } from "./common/type-guards.js";
export { extractFrontmatter } from "./discovery/extract-frontmatter.js";
export { parseAgentFile } from "./discovery/parser.js";
export { scanForAgentFiles } from "./discovery/scanner.js";
export type { AgentConfig, DiscoveryDiagnostic } from "./discovery/validator.js";
export { validateAgent } from "./discovery/validator.js";
export type { AgentMetrics } from "./invocation/metrics.js";
export { createMetricsTracker, sumMetrics } from "./invocation/metrics.js";
export { resolveModel } from "./invocation/resolve-model.js";
export { runAgent } from "./invocation/session.js";
export type { RunAgentParams, RunAgentResult } from "./invocation/session-helpers.js";
export type { AssemblyContext } from "./prompt/assembly.js";
export { assembleSystemPrompt } from "./prompt/assembly.js";
export { resolveVariables } from "./prompt/variables.js";
export type { AgentFrontmatter } from "./schema/frontmatter.js";
export { AgentFrontmatterSchema, PI_DEFAULT_TOOLS, validateFrontmatter } from "./schema/frontmatter.js";
export { createAgentTool } from "./tool/agent-tool.js";
export { formatTokens, formatUsageStats } from "./tool/format.js";
export type { ChainResult, RunAgentFn } from "./tool/modes.js";
export {
  aggregateMetricsArray,
  collectAgentNames,
  detectMode,
  executeChain,
  executeParallel,
} from "./tool/modes.js";
export type { RenderTheme } from "./tool/render-types.js";
export { BorderedBox } from "./tui/bordered-box.js";
export { renderConversation } from "./tui/conversation.js";
export { buildFinalEvents, buildPartialEvents } from "./tui/render-events.js";
export type { AgentStatus, ConversationEvent } from "./tui/types.js";
// biome-ignore-end lint/performance/noBarrelFile: api.ts is the designated public surface
