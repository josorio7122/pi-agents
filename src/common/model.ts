export function parseModelId(model: string) {
  const slashIndex = model.indexOf("/");
  if (slashIndex === -1 || slashIndex === 0) {
    throw new Error(
      `Invalid model format: "${model}". Expected "provider/model-id" (e.g., "anthropic/claude-sonnet-4-6").`,
    );
  }
  return {
    provider: model.slice(0, slashIndex),
    modelId: model.slice(slashIndex + 1),
  };
}
