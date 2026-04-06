import { describe, expect, it } from "vitest";
import { createSubmitTool } from "./submit-tool.js";

describe("createSubmitTool", () => {
  it("returns a tool with correct name and description", () => {
    const tool = createSubmitTool();
    expect(tool.name).toBe("submit");
    expect(tool.description).toContain("MUST");
    expect(tool.description).toContain("final action");
  });

  it("passes response through as tool result content", async () => {
    const tool = createSubmitTool();
    const result = await tool.execute("tc-1", { response: "## Report\n\nFindings here." });
    expect(result.content).toEqual([{ type: "text", text: "## Report\n\nFindings here." }]);
  });

  it("handles empty response", async () => {
    const tool = createSubmitTool();
    const result = await tool.execute("tc-1", { response: "" });
    expect(result.content).toEqual([{ type: "text", text: "" }]);
  });
});
