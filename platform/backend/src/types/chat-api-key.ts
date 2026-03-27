import { SupportedProvidersSchema } from "@shared";
import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";
import { schema } from "@/database";
import { SecretStorageTypeSchema } from "./mcp-server";
import {
  type LlmProviderApiKeyScope,
  LlmProviderApiKeyScopeSchema,
} from "./visibility";

// LLM provider API key schemas
export const SelectLlmProviderApiKeySchema = createSelectSchema(
  schema.llmProviderApiKeysTable,
).extend({
  provider: SupportedProvidersSchema,
  scope: LlmProviderApiKeyScopeSchema,
  // baseUrl is nullable in the DB schema (text without .notNull()) but
  // drizzle-zod's createSelectSchema defaults text columns to z.string().
  // Override to match the actual DB column nullability so Fastify response
  // serialization doesn't throw when baseUrl is null.
  baseUrl: z.string().nullable(),
});

export const InsertLlmProviderApiKeySchema = createInsertSchema(
  schema.llmProviderApiKeysTable,
)
  .omit({
    id: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    provider: SupportedProvidersSchema,
    scope: LlmProviderApiKeyScopeSchema,
  });

export const UpdateLlmProviderApiKeySchema = createUpdateSchema(
  schema.llmProviderApiKeysTable,
)
  .omit({
    id: true,
    organizationId: true,
    createdAt: true,
    updatedAt: true,
  })
  .extend({
    provider: SupportedProvidersSchema.optional(),
    scope: LlmProviderApiKeyScopeSchema.optional(),
    isPrimary: z.boolean().optional(),
  });

export type LlmProviderApiKey = z.infer<typeof SelectLlmProviderApiKeySchema>;
export type InsertLlmProviderApiKey = z.infer<
  typeof InsertLlmProviderApiKeySchema
>;
export type UpdateLlmProviderApiKey = z.infer<
  typeof UpdateLlmProviderApiKeySchema
>;

// Response schema with scope display info
export const LlmProviderApiKeyWithScopeInfoSchema =
  SelectLlmProviderApiKeySchema.extend({
    teamName: z.string().nullable().optional(),
    userName: z.string().nullable().optional(),
    // BYOS vault reference info (only populated when BYOS is enabled and secret is a vault reference)
    vaultSecretPath: z.string().nullable().optional(),
    vaultSecretKey: z.string().nullable().optional(),
    // Secret storage type (database, vault, external_vault, or none)
    secretStorageType: SecretStorageTypeSchema.optional(),
    // Best model ID for this API key (based on is_best marker)
    bestModelId: z.string().nullable().optional(),
    // Whether this key was included because it's configured on an agent (user may not have direct access)
    isAgentKey: z.boolean().optional(),
  });

export type LlmProviderApiKeyWithScopeInfo = z.infer<
  typeof LlmProviderApiKeyWithScopeInfoSchema
>;

export const ChatApiKeyScopeSchema = LlmProviderApiKeyScopeSchema;
export type ChatApiKeyScope = LlmProviderApiKeyScope;
export const SelectChatApiKeySchema = SelectLlmProviderApiKeySchema;
export const InsertChatApiKeySchema = InsertLlmProviderApiKeySchema;
export const UpdateChatApiKeySchema = UpdateLlmProviderApiKeySchema;
export type ChatApiKey = LlmProviderApiKey;
export type InsertChatApiKey = InsertLlmProviderApiKey;
export type UpdateChatApiKey = UpdateLlmProviderApiKey;
export const ChatApiKeyWithScopeInfoSchema =
  LlmProviderApiKeyWithScopeInfoSchema;
export type ChatApiKeyWithScopeInfo = LlmProviderApiKeyWithScopeInfo;
