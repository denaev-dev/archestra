import {
  createInsertSchema,
  createSelectSchema,
  createUpdateSchema,
} from "drizzle-zod";
import { z } from "zod";
import { schema } from "@/database";

export const McpRateLimitTypeSchema = z.enum([
  "mcp_server_calls",
  "tool_calls",
]);
export type McpRateLimitType = z.infer<typeof McpRateLimitTypeSchema>;

/**
 * Common rate limit window presets in seconds
 */
export const RateLimitWindowSeconds = {
  OneMinute: 60,
  OneHour: 3_600,
  OneDay: 86_400,
  OneWeek: 604_800,
  OneMonth: 2_592_000,
} as const;

export const SelectMcpRateLimitSchema = createSelectSchema(
  schema.mcpRateLimitsTable,
  {
    limitType: McpRateLimitTypeSchema,
  },
);

export const InsertMcpRateLimitSchema = createInsertSchema(
  schema.mcpRateLimitsTable,
  {
    limitType: McpRateLimitTypeSchema,
  },
);

export const UpdateMcpRateLimitSchema = createUpdateSchema(
  schema.mcpRateLimitsTable,
  {
    limitType: McpRateLimitTypeSchema,
  },
).omit({
  id: true,
  agentId: true,
  createdAt: true,
  updatedAt: true,
});

export const CreateMcpRateLimitSchema = InsertMcpRateLimitSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
}).refine(
  (data) => {
    if (data.limitType === "tool_calls" && !data.toolName) {
      return false;
    }
    if (data.maxCalls <= 0) {
      return false;
    }
    if (data.windowSeconds <= 0) {
      return false;
    }
    return true;
  },
  {
    message:
      "Invalid MCP rate limit configuration: tool_calls requires toolName, maxCalls and windowSeconds must be > 0",
  },
);

export const McpRateLimitWithUsageSchema = SelectMcpRateLimitSchema.extend({
  mcpUsage: z.number().optional(),
});

export type McpRateLimit = z.infer<typeof SelectMcpRateLimitSchema>;
export type InsertMcpRateLimit = z.infer<typeof InsertMcpRateLimitSchema>;
export type CreateMcpRateLimit = z.infer<typeof CreateMcpRateLimitSchema>;
export type UpdateMcpRateLimit = z.infer<typeof UpdateMcpRateLimitSchema>;
export type McpRateLimitWithUsage = z.infer<typeof McpRateLimitWithUsageSchema>;
