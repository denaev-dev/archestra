import { createInsertSchema, createSelectSchema } from "drizzle-zod";
import { z } from "zod";
import { schema } from "@/database";
import {
  type ResourceVisibilityScope,
  ResourceVisibilityScopeSchema,
} from "./visibility";

export const VirtualApiKeyScopeSchema = ResourceVisibilityScopeSchema;
export type VirtualApiKeyScope = ResourceVisibilityScope;

const VirtualApiKeyTeamSchema = z.object({
  id: z.string(),
  name: z.string(),
});

export const SelectVirtualApiKeySchema = createSelectSchema(
  schema.virtualApiKeysTable,
);

export const InsertVirtualApiKeySchema = createInsertSchema(
  schema.virtualApiKeysTable,
).omit({
  id: true,
  createdAt: true,
  lastUsedAt: true,
});

/** Schema for virtual key response at creation time (includes full token value) */
export const VirtualApiKeyWithValueSchema = SelectVirtualApiKeySchema.extend({
  value: z.string(),
  teams: z.array(VirtualApiKeyTeamSchema),
  authorName: z.string().nullable(),
});

/** Schema for virtual key with parent API key info (for org-wide listing) */
export const VirtualApiKeyWithParentInfoSchema =
  SelectVirtualApiKeySchema.extend({
    parentKeyName: z.string(),
    parentKeyProvider: z.string(),
    parentKeyBaseUrl: z.string().nullable(),
    teams: z.array(VirtualApiKeyTeamSchema),
    authorName: z.string().nullable(),
  });

export type SelectVirtualApiKey = z.infer<typeof SelectVirtualApiKeySchema>;
export type InsertVirtualApiKey = z.infer<typeof InsertVirtualApiKeySchema>;
export type VirtualApiKeyWithValue = z.infer<
  typeof VirtualApiKeyWithValueSchema
>;
export type VirtualApiKeyWithParentInfo = z.infer<
  typeof VirtualApiKeyWithParentInfoSchema
>;
