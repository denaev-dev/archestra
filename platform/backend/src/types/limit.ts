import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";
import { schema } from "@/database";

/**
 * Entity types that can have limits applied
 */
export const LimitEntityTypeSchema = z.enum(["organization", "team"]);
export type LimitEntityType = z.infer<typeof LimitEntityTypeSchema>;

/**
 * Base database schema derived from Drizzle
 */
export const SelectLimitSchema = createSelectSchema(schema.limitsTable, {
  entityType: LimitEntityTypeSchema,
  model: z.array(z.string()).nullable().optional(),
});
export const InsertLimitSchema = createInsertSchema(schema.limitsTable, {
  entityType: LimitEntityTypeSchema,
  model: z.array(z.string()).nullable().optional(),
});
export const UpdateLimitSchema = createUpdateSchema(schema.limitsTable, {
  entityType: LimitEntityTypeSchema,
  model: z.array(z.string()).nullable().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

/**
 * Refined types for better type safety and validation
 */
export const CreateLimitSchema = InsertLimitSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).refine(
  (data) => {
    // Requires non-empty model array and should not have mcp or tool specificity
    if (!data.model || !Array.isArray(data.model) || data.model.length === 0) {
      return false;
    }
    if (data.mcpServerName || data.toolName) {
      return false;
    }
    return true;
  },
  {
    message:
      "A non-empty model array is required. mcpServerName and toolName are not allowed.",
  },
);

/**
 * Exported types
 */
export type Limit = z.infer<typeof SelectLimitSchema>;
export type InsertLimit = z.infer<typeof InsertLimitSchema>;
export type CreateLimit = z.infer<typeof CreateLimitSchema>;
export type UpdateLimit = z.infer<typeof UpdateLimitSchema>;

/**
 * Helper type for limit usage tracking
 */
export interface LimitUsageInfo {
  limitId: string;
  currentUsage: number;
  limitValue: number;
  isExceeded: boolean;
  remainingUsage: number;
}

/**
 * Per-model usage breakdown for a limit
 */
export interface ModelUsageBreakdown {
  model: string;
  tokensIn: number;
  tokensOut: number;
  cost: number;
}

/**
 * Limit with per-model usage breakdown
 */
export const LimitWithUsageSchema = SelectLimitSchema.extend({
  modelUsage: z
    .array(
      z.object({
        model: z.string(),
        tokensIn: z.number(),
        tokensOut: z.number(),
        cost: z.number(),
      }),
    )
    .optional(),
});

export type LimitWithUsage = z.infer<typeof LimitWithUsageSchema>;
