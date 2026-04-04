import { describe, expect, it } from "vitest";
import { AgentFrontmatterSchema } from "./frontmatter.js";

const validWorker = {
  name: "backend-dev",
  description: "Builds APIs and infrastructure.",
  model: "anthropic/claude-sonnet-4-6",
  role: "worker",
  color: "#36f9f6",
  icon: "💻",
  domain: [{ path: "apps/backend/", read: true, write: true, delete: true }],
  tools: ["read", "write", "edit", "grep", "bash", "find", "ls"],
  skills: [{ path: ".pi/skills/mental-model.md", when: "Read at task start." }],
  knowledge: {
    project: {
      path: ".pi/knowledge/project/backend-dev.yaml",
      description: "Track patterns.",
      updatable: true,
      "max-lines": 10000,
    },
    general: {
      path: ".pi/knowledge/general/backend-dev.yaml",
      description: "General strategies.",
      updatable: true,
      "max-lines": 5000,
    },
  },
  conversation: { path: ".pi/sessions/{{SESSION_ID}}/conversation.jsonl" },
};

const validLead = {
  ...validWorker,
  name: "eng-lead",
  role: "lead",
  tools: ["read", "write", "grep", "find", "ls", "delegate"],
};

const validOrchestrator = {
  ...validWorker,
  name: "orchestrator",
  role: "orchestrator",
  tools: ["read", "write", "grep", "find", "ls", "delegate"],
};

describe("AgentFrontmatterSchema", () => {
  describe("happy path", () => {
    it("accepts valid worker", () => {
      expect(AgentFrontmatterSchema.safeParse(validWorker).success).toBe(true);
    });

    it("accepts valid lead", () => {
      expect(AgentFrontmatterSchema.safeParse(validLead).success).toBe(true);
    });

    it("accepts valid orchestrator", () => {
      expect(AgentFrontmatterSchema.safeParse(validOrchestrator).success).toBe(true);
    });
  });

  describe("missing blocks", () => {
    it("rejects missing name", () => {
      const { name: _, ...data } = validWorker;
      const result = AgentFrontmatterSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it("rejects missing domain", () => {
      const { domain: _, ...data } = validWorker;
      const result = AgentFrontmatterSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it("rejects missing tools", () => {
      const { tools: _, ...data } = validWorker;
      const result = AgentFrontmatterSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it("rejects missing skills", () => {
      const { skills: _, ...data } = validWorker;
      const result = AgentFrontmatterSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it("rejects missing knowledge", () => {
      const { knowledge: _, ...data } = validWorker;
      const result = AgentFrontmatterSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it("rejects missing conversation", () => {
      const { conversation: _, ...data } = validWorker;
      const result = AgentFrontmatterSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it("rejects missing color", () => {
      const { color: _, ...data } = validWorker;
      const result = AgentFrontmatterSchema.safeParse(data);
      expect(result.success).toBe(false);
    });

    it("rejects missing icon", () => {
      const { icon: _, ...data } = validWorker;
      const result = AgentFrontmatterSchema.safeParse(data);
      expect(result.success).toBe(false);
    });
  });

  describe("invalid values", () => {
    it("rejects invalid role", () => {
      const result = AgentFrontmatterSchema.safeParse({ ...validWorker, role: "invalid" });
      expect(result.success).toBe(false);
    });

    it("rejects model without provider", () => {
      const result = AgentFrontmatterSchema.safeParse({ ...validWorker, model: "claude-sonnet-4-6" });
      expect(result.success).toBe(false);
    });

    it("accepts model with provider", () => {
      const result = AgentFrontmatterSchema.safeParse({ ...validWorker, model: "anthropic/claude-sonnet-4-6" });
      expect(result.success).toBe(true);
    });

    it("rejects invalid hex color", () => {
      const result = AgentFrontmatterSchema.safeParse({ ...validWorker, color: "not-hex" });
      expect(result.success).toBe(false);
    });

    it("rejects empty tools array", () => {
      const result = AgentFrontmatterSchema.safeParse({ ...validWorker, tools: [] });
      expect(result.success).toBe(false);
    });

    it("accepts custom tool names", () => {
      const result = AgentFrontmatterSchema.safeParse({
        ...validWorker,
        tools: ["read", "my-custom-tool", "another_tool"],
      });
      expect(result.success).toBe(true);
    });

    it("rejects empty domain array", () => {
      const result = AgentFrontmatterSchema.safeParse({ ...validWorker, domain: [] });
      expect(result.success).toBe(false);
    });

    it("rejects conversation path without SESSION_ID", () => {
      const result = AgentFrontmatterSchema.safeParse({
        ...validWorker,
        conversation: { path: ".pi/sessions/conversation.jsonl" },
      });
      expect(result.success).toBe(false);
    });

    it("rejects negative max-lines", () => {
      const result = AgentFrontmatterSchema.safeParse({
        ...validWorker,
        knowledge: {
          ...validWorker.knowledge,
          project: { ...validWorker.knowledge.project, "max-lines": -1 },
        },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("reports (optional)", () => {
    it("accepts agent without reports block", () => {
      expect(AgentFrontmatterSchema.safeParse(validWorker).success).toBe(true);
    });

    it("accepts agent with valid reports block", () => {
      const result = AgentFrontmatterSchema.safeParse({
        ...validWorker,
        reports: { path: ".pi/reports", updatable: true },
      });
      expect(result.success).toBe(true);
    });

    it("rejects reports with empty path", () => {
      const result = AgentFrontmatterSchema.safeParse({
        ...validWorker,
        reports: { path: "", updatable: true },
      });
      expect(result.success).toBe(false);
    });

    it("rejects reports missing updatable", () => {
      const result = AgentFrontmatterSchema.safeParse({
        ...validWorker,
        reports: { path: ".pi/reports" },
      });
      expect(result.success).toBe(false);
    });
  });
});
