import type { Api, Model } from "@mariozechner/pi-ai";
import type { ModelRegistry } from "@mariozechner/pi-coding-agent";
import { parseModelId } from "../common/model.js";

export function resolveModel(params: {
  readonly fmModel: string | undefined;
  readonly inherited: Model<Api> | undefined;
  readonly registry: ModelRegistry;
}): Model<Api> {
  const { fmModel, inherited, registry } = params;

  // Inherit path: undefined or "inherit" → parent session's model.
  if (fmModel === undefined || fmModel === "inherit") {
    if (!inherited) {
      throw new Error(
        `agent declares 'model: inherit' (or omits model) but no model is active in the parent session. Select a model with /model or start pi with --model provider/name.`,
      );
    }
    return inherited;
  }

  // Pinned path: explicit "provider/name".
  const { provider, modelId } = parseModelId(fmModel);
  const model = registry.find(provider, modelId);
  if (!model) {
    throw new Error(`Model not found: ${fmModel}`);
  }
  return model;
}
