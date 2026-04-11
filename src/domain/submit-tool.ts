import { Type } from "@sinclair/typebox";
import { isRecord } from "../common/type-guards.js";

const SUBMIT_TOOL_NAME = "submit";

const SUBMIT_DESCRIPTION =
  "Submit your response to the caller. You MUST call this exactly once as your final action — it is your only way to deliver output. Everything you want the caller to see goes in the response parameter.";

const submitParameters = Type.Object({
  response: Type.String({ description: "Your complete response text" }),
});

export function createSubmitTool() {
  return {
    name: SUBMIT_TOOL_NAME,
    label: SUBMIT_TOOL_NAME,
    description: SUBMIT_DESCRIPTION,
    parameters: submitParameters,
    async execute(_toolCallId: string, params: unknown) {
      const p = isRecord(params) ? params : {};
      const response = typeof p.response === "string" ? p.response : "";
      return {
        content: [{ type: "text" as const, text: response }],
        details: undefined,
      };
    },
  };
}
