import { getMarkdownTheme } from "@mariozechner/pi-coding-agent";
import { Container, Markdown, Spacer } from "@mariozechner/pi-tui";
import { colorize } from "../common/color.js";
import type { AgentConfig } from "../discovery/validator.js";
import type { RenderTheme } from "../tool/render-types.js";
import { BorderedBox } from "./bordered-box.js";
import type { ConversationEvent } from "./types.js";

function agentLabel(params: { readonly config: AgentConfig }) {
  const fm = params.config.frontmatter;
  return `${fm.icon} ${colorize(fm.color, fm.name)}`;
}

function eventHeader(params: {
  readonly event: ConversationEvent;
  readonly agents: ReadonlyMap<string, AgentConfig>;
  readonly theme: RenderTheme;
}) {
  const { event, agents, theme } = params;
  if (event.type === "delegation") {
    const from = agents.get(event.from);
    const to = agents.get(event.to);
    if (!from || !to) return `${event.from} → ${event.to}`;
    return `${agentLabel({ config: from })} ${theme.fg("dim", "→")} ${agentLabel({ config: to })}`;
  }
  const config = agents.get(event.agent);
  if (!config) return event.agent;
  return agentLabel({ config });
}

function eventBody(event: ConversationEvent) {
  return event.type === "delegation" ? event.task : event.output;
}

export function renderConversation(params: {
  readonly events: ReadonlyArray<ConversationEvent>;
  readonly agents: ReadonlyMap<string, AgentConfig>;
  readonly theme: RenderTheme;
}) {
  const { events, agents, theme } = params;
  const container = new Container();
  const mdTheme = getMarkdownTheme();

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    if (!event) continue;

    if (i > 0) container.addChild(new Spacer(1));

    const header = eventHeader({ event, agents, theme });
    const box = new BorderedBox({ header, borderColor: (s) => theme.fg("dim", s) });
    box.addChild(new Markdown(eventBody(event), 0, 0, mdTheme));
    container.addChild(box);
  }

  return container;
}
