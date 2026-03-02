import {
  index,
  integer,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import type { McpRateLimitType } from "@/types/mcp-rate-limit";
import agentsTable from "./agent";

const mcpRateLimitsTable = pgTable(
  "mcp_rate_limits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agentsTable.id, { onDelete: "cascade" }),
    limitType: varchar("limit_type").$type<McpRateLimitType>().notNull(),
    mcpServerName: varchar("mcp_server_name", { length: 255 }).notNull(),
    toolName: varchar("tool_name", { length: 255 }),
    maxCalls: integer("max_calls").notNull(),
    windowSeconds: integer("window_seconds").notNull(),
    createdAt: timestamp("created_at", { mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { mode: "date" })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => ({
    agentIdx: index("mcp_rate_limits_agent_idx").on(table.agentId),
    agentServerIdx: index("mcp_rate_limits_agent_server_idx").on(
      table.agentId,
      table.mcpServerName,
    ),
  }),
);

export default mcpRateLimitsTable;
