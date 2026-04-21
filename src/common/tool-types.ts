import type { ToolDefinition } from "@mariozechner/pi-coding-agent";

/**
 * Schema-erased alias for pi's `ToolDefinition`. Our wrappers forward params
 * opaquely and don't need to preserve the per-tool schema generic, so we widen
 * all three type parameters to `any`. This lets specific variants (e.g. the
 * one returned by `createReadToolDefinition`) assign structurally under
 * `exactOptionalPropertyTypes`, where contravariant `renderCall`/`renderResult`
 * positions would otherwise reject a narrower schema's args type.
 */
// biome-ignore lint/suspicious/noExplicitAny: schema-erased structural subset of ToolDefinition
export type ExecutableTool = ToolDefinition<any, any, any>;
