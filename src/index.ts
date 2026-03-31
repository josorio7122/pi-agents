import { randomUUID } from "node:crypto";
import { join } from "node:path";
import type { ExtensionAPI } from "@mariozechner/pi-coding-agent";
import { getAgentDir } from "@mariozechner/pi-coding-agent";
import { formatAgentList } from "./command/agents-command.js";
import { bootstrapKnowledge } from "./discovery/bootstrap.js";
import { parseAgentFile } from "./discovery/parser.js";
import { scanForAgentFiles } from "./discovery/scanner.js";
import type { AgentConfig, DiscoveryDiagnostic } from "./discovery/validator.js";
import { validateAgent } from "./discovery/validator.js";

function discoverAgents(params: { readonly projectDir: string; readonly userDir: string }) {
  const diagnostics: DiscoveryDiagnostic[] = [];
  const agentMap = new Map<string, AgentConfig>();

  for (const [dir, source] of [[params.userDir, "user"] as const, [params.projectDir, "project"] as const]) {
    for (const filePath of scanForAgentFiles(dir)) {
      const { readFileSync } = require("node:fs");
      let content: string;
      try {
        content = readFileSync(filePath, "utf-8");
      } catch {
        diagnostics.push({ level: "warning", filePath, message: "Could not read file" });
        continue;
      }

      const parsed = parseAgentFile(content);
      if (!parsed.ok) {
        diagnostics.push({ level: "error", filePath, message: parsed.error });
        continue;
      }

      const validated = validateAgent({
        frontmatter: parsed.value.frontmatter,
        body: parsed.value.body,
        filePath,
        source,
      });

      if (!validated.ok) {
        for (const d of validated.errors) diagnostics.push(d);
        continue;
      }

      // Project overrides user (same name)
      agentMap.set(validated.value.frontmatter.name, validated.value);
    }
  }

  return { agents: Array.from(agentMap.values()), diagnostics };
}

export default function (pi: ExtensionAPI) {
  let agents: AgentConfig[] = [];
  // Used for resolving {{SESSION_ID}} in conversation paths when agent tool is wired
  let _sessionId: string | undefined;

  pi.on("session_start", async (_event, ctx) => {
    _sessionId = randomUUID();

    const result = discoverAgents({
      projectDir: join(ctx.cwd, ".pi", "agents"),
      userDir: join(getAgentDir(), "agents"),
    });

    agents = result.agents;

    for (const d of result.diagnostics) {
      ctx.ui.notify(`[pi-agents] ${d.level}: ${d.filePath} — ${d.message}`, d.level === "error" ? "error" : "warning");
    }

    bootstrapKnowledge(agents);

    if (agents.length > 0) {
      ctx.ui.notify(`[pi-agents] ${agents.length} agent(s) loaded`, "info");
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
