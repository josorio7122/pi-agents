// Public API for pi-agents
// Curated surface for consumers (e.g. pi-teams). Not a barrel — only intentional exports.

export { colorize } from "./common/color.js";
export type { ContextFile } from "./common/context-files.js";
export { discoverContextFiles } from "./common/context-files.js";
// Common utilities
export { readFileSafe } from "./common/fs.js";
export { parseModelId } from "./common/model.js";
export { expandPath, resolveConversationPath } from "./common/paths.js";
export { spinnerFrame, workingDots } from "./common/spinner.js";
// Discovery
export { parseAgentFile } from "./discovery/parser.js";
export { scanForAgentFiles } from "./discovery/scanner.js";
export type { AgentConfig, DiscoveryDiagnostic } from "./discovery/validator.js";
export { validateAgent } from "./discovery/validator.js";
// Domain
export { checkDomain } from "./domain/checker.js";
export { enforceMaxLines } from "./domain/max-lines.js";
export { buildDomainWithKnowledge } from "./domain/scoped-tools.js";
export { appendToLog, ensureLogExists, readLog } from "./invocation/conversation-log.js";
export type { AgentMetrics } from "./invocation/metrics.js";
export { createMetricsTracker } from "./invocation/metrics.js";
export { runAgent } from "./invocation/session.js";
// Invocation
export type { RunAgentParams, RunAgentResult } from "./invocation/session-helpers.js";
export { createToolForAgent } from "./invocation/tool-wrapper.js";
export type { AssemblyContext } from "./prompt/assembly.js";
// Prompt
export { assembleSystemPrompt } from "./prompt/assembly.js";
export { resolveVariables } from "./prompt/variables.js";
export type { ConversationEntry } from "./schema/conversation.js";
export { ConversationEntrySchema } from "./schema/conversation.js";
export type { AgentFrontmatter } from "./schema/frontmatter.js";
// Schema
export { AgentFrontmatterSchema } from "./schema/frontmatter.js";
export { validateRoleTools } from "./schema/validation.js";
// Formatting
export { formatTokens, formatUsageStats } from "./tool/format.js";
export type { ChainResult, RunAgentFn } from "./tool/modes.js";
// Execution modes
export {
  aggregateMetricsArray,
  collectAgentNames,
  detectMode,
  executeChain,
  executeParallel,
  executeSingle,
} from "./tool/modes.js";
// Rendering
export type { RenderTheme } from "./tool/render-types.js";
// TUI components
export { BorderedBox } from "./tui/bordered-box.js";
export { renderConversation } from "./tui/conversation.js";
export { buildFinalEvents, buildPartialEvents } from "./tui/render-events.js";
export type { AgentStatus, ConversationEvent } from "./tui/types.js";
