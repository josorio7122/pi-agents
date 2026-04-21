import type { Static } from "@sinclair/typebox";
import { Type } from "@sinclair/typebox";

export const ConversationEntrySchema = Type.Object({
  ts: Type.String({ minLength: 1 }),
  from: Type.String({ minLength: 1 }),
  to: Type.String({ minLength: 1 }),
  message: Type.String({ minLength: 1 }),
  type: Type.Optional(Type.String()),
});

export type ConversationEntry = Readonly<Static<typeof ConversationEntrySchema>>;
