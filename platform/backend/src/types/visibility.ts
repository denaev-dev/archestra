import { z } from "zod";

export const ResourceVisibilityScopeSchema = z.enum([
  "personal",
  "team",
  "org",
]);
export type ResourceVisibilityScope = z.infer<
  typeof ResourceVisibilityScopeSchema
>;

export const ResourceVisibilityScopeFilterSchema = z.enum([
  "personal",
  "team",
  "org",
  "built_in",
]);
export type ResourceVisibilityScopeFilter = z.infer<
  typeof ResourceVisibilityScopeFilterSchema
>;

export const LlmProviderApiKeyScopeSchema = z.enum([
  "personal",
  "team",
  "org_wide",
]);
export type LlmProviderApiKeyScope = z.infer<
  typeof LlmProviderApiKeyScopeSchema
>;
