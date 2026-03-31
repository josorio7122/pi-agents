import { z } from "zod/v4";

export const ConversationEntrySchema = z.object({
  ts: z.string().min(1),
  from: z.string().min(1),
  to: z.string().min(1),
  message: z.string().min(1),
  type: z.string().optional(),
});

export type ConversationEntry = z.infer<typeof ConversationEntrySchema>;
