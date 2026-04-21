import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { formatAgentList } from "./command/agents-command.js";
import { resolveConversationPath } from "./common/paths.js";
import { extractFrontmatter } from "./discovery/extract-frontmatter.js";
import { scanForAgentFiles } from "./discovery/scanner.js";
import type { AgentConfig, DiscoveryDiagnostic } from "./discovery/validator.js";
import { validateAgent } from "./discovery/validator.js";
import { createAgentTool } from "./tool/agent-tool.js";

async function loadAgentFile(params: {
  readonly filePath: string;
  readonly source: "project" | "user";
}): Promise<
  | { readonly ok: true; readonly value: AgentConfig }
  | { readonly ok: false; readonly errors: ReadonlyArray<DiscoveryDiagnostic> }
> {
  const content = await readFile(params.filePath, "utf-8").catch(() => undefined);
  if (content === undefined) {
    return {
      ok: false,
      errors: [{ level: "warning", filePath: params.filePath, message: "Could not read file" }],
    };
  }
  const extracted = extractFrontmatter(content);
  if (!extracted.ok) {
    return {
      ok: false,
      errors: [{ level: "error", filePath: params.filePath, message: extracted.error }],
    };
  }

  const validated = validateAgent({
    frontmatter: extracted.value.frontmatter,
    body: extracted.value.body,
    filePath: params.filePath,
    source: params.source,
  });
  if (!validated.ok) return { ok: false, errors: validated.errors };
  return { ok: true, value: validated.value };
}

async function loadAgentsFromDir(params: { readonly dir: string; readonly source: "project" | "user" }): Promise<{
  readonly agents: ReadonlyArray<AgentConfig>;
  readonly diagnostics: ReadonlyArray<DiscoveryDiagnostic>;
}> {
  const filePaths = await scanForAgentFiles(params.dir);
  const results = await Promise.all(filePaths.map((filePath) => loadAgentFile({ filePath, source: params.source })));
  const agents: AgentConfig[] = [];
  const diagnostics: DiscoveryDiagnostic[] = [];
  for (const r of results) {
    if (r.ok) agents.push(r.value);
    else diagnostics.push(...r.errors);
  }
  return { agents, diagnostics };
}

async function discoverAgents(params: { readonly projectDir: string; readonly userDir: string }) {
  const userResult = await loadAgentsFromDir({ dir: params.userDir, source: "user" });
  const projectResult = await loadAgentsFromDir({ dir: params.projectDir, source: "project" });

  // Project overrides user (same name)
  const agentMap = new Map<string, AgentConfig>();
  for (const a of userResult.agents) agentMap.set(a.frontmatter.name, a);
  for (const a of projectResult.agents) agentMap.set(a.frontmatter.name, a);

  return {
    agents: Array.from(agentMap.values()),
    diagnostics: [...userResult.diagnostics, ...projectResult.diagnostics],
  };
}

export default function (pi: ExtensionAPI) {
  let agents: ReadonlyArray<AgentConfig> = [];
  let sessionId = "";

  // Register theme path so pi can discover the theme JSON files
  pi.on("resources_discover", async () => {
    const extDir = dirname(fileURLToPath(import.meta.url));
    return { themePaths: [join(extDir, "..", "themes")] };
  });

  pi.on("session_start", async (_event, ctx) => {
    sessionId = randomUUID();

    const result = await discoverAgents({
      projectDir: join(ctx.cwd, ".pi", "agents"),
      userDir: join(getAgentDir(), "agents"),
    });

    agents = result.agents;

    for (const d of result.diagnostics) {
      ctx.ui.notify(`[pi-agents] ${d.level}: ${d.filePath} — ${d.message}`, d.level === "error" ? "error" : "warning");
    }

    const templates = new Set(agents.map((a) => a.frontmatter.conversation.path));
    if (templates.size > 1) {
      ctx.ui.notify("[pi-agents] warning: agents disagree on conversation.path; using default", "warning");
    }
    const uniqueTemplate: string | undefined = templates.size === 1 ? [...templates][0] : undefined;
    const conversationLogPath = uniqueTemplate
      ? resolveConversationPath({ template: uniqueTemplate, sessionId, cwd: ctx.cwd })
      : join(ctx.cwd, ".pi", "sessions", sessionId, "conversation.jsonl");

    // Register agent tool with discovered agents
    if (agents.length > 0) {
      const tool = createAgentTool({
        agents,
        modelRegistry: ctx.modelRegistry,
        cwd: ctx.cwd,
        sessionDir: join(ctx.cwd, ".pi", "sessions", sessionId),
        conversationLogPath,
      });
      pi.registerTool(tool);
      ctx.ui.notify(`[pi-agents] ${agents.length} agent(s) loaded`, "info");
    }
  });

  // Apply theme once — must happen after resources_discover so pi knows the theme path
  let themeApplied = false;
  pi.on("before_agent_start", async (_event, ctx) => {
    if (!themeApplied) {
      themeApplied = true;
      ctx.ui.setTheme("pi-agents-dark");
    }
  });

  pi.registerCommand("agents", {
    description: "List available agents",
    handler: async (_args, ctx) => {
      const lines = formatAgentList(agents);
      ctx.ui.notify(lines.join("\n"), "info");
    },
  });
}
