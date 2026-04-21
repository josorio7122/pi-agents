import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";

export type SafeParseIssue = Readonly<{
  path: ReadonlyArray<string | number>;
  message: string;
}>;

export type SafeParseResult<T extends TSchema> =
  | { readonly success: true; readonly data: Static<T> }
  | { readonly success: false; readonly error: { readonly issues: ReadonlyArray<SafeParseIssue> } };

export function safeParse<T extends TSchema>(schema: T, data: unknown): SafeParseResult<T> {
  if (Value.Check(schema, data)) {
    return { success: true, data: data as Static<T> };
  }

  const issues = Array.from(Value.Errors(schema, data), (err) => ({
    path: err.path.split("/").filter((p) => p.length > 0),
    message: err.message,
  }));
  return { success: false, error: { issues } };
}
