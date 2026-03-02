import { and, eq } from "drizzle-orm";
import { getDb, schema } from "@/database";
import type {
  CreateMcpRateLimit,
  McpRateLimitType,
  UpdateMcpRateLimit,
} from "@/types";

export default class McpRateLimitModel {
  static async create(data: CreateMcpRateLimit) {
    const db = getDb();
    const [result] = await db
      .insert(schema.mcpRateLimitsTable)
      .values(data)
      .returning();
    return result;
  }

  static async findByAgentId(agentId: string) {
    const db = getDb();
    return db
      .select()
      .from(schema.mcpRateLimitsTable)
      .where(eq(schema.mcpRateLimitsTable.agentId, agentId));
  }

  static async findAll(filters?: {
    agentId?: string;
    limitType?: McpRateLimitType;
  }) {
    const db = getDb();
    const conditions = [];
    if (filters?.agentId) {
      conditions.push(eq(schema.mcpRateLimitsTable.agentId, filters.agentId));
    }
    if (filters?.limitType) {
      conditions.push(
        eq(schema.mcpRateLimitsTable.limitType, filters.limitType),
      );
    }

    return db
      .select()
      .from(schema.mcpRateLimitsTable)
      .where(conditions.length > 0 ? and(...conditions) : undefined);
  }

  static async findById(id: string) {
    const db = getDb();
    const [result] = await db
      .select()
      .from(schema.mcpRateLimitsTable)
      .where(eq(schema.mcpRateLimitsTable.id, id));
    return result ?? null;
  }

  static async patch(id: string, data: Partial<UpdateMcpRateLimit>) {
    const db = getDb();
    const [result] = await db
      .update(schema.mcpRateLimitsTable)
      .set(data)
      .where(eq(schema.mcpRateLimitsTable.id, id))
      .returning();
    return result ?? null;
  }

  static async delete(id: string) {
    const db = getDb();
    const [result] = await db
      .delete(schema.mcpRateLimitsTable)
      .where(eq(schema.mcpRateLimitsTable.id, id))
      .returning({ id: schema.mcpRateLimitsTable.id });
    return !!result;
  }
}
