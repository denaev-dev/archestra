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
