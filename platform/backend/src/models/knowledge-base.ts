import { and, count, desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import db, { schema } from "@/database";
import type {
  InsertKnowledgeBase,
  KnowledgeBase,
  UpdateKnowledgeBase,
} from "@/types";

class KnowledgeBaseModel {
  static async findByOrganization(params: {
    organizationId: string;
    limit?: number;
    offset?: number;
    search?: string;
    canReadAll?: boolean;
    viewerTeamIds?: string[];
  }): Promise<KnowledgeBase[]> {
    const normalizedSearch = params.search?.trim();
    const filters = [
      eq(schema.knowledgeBasesTable.organizationId, params.organizationId),
      buildVisibilityFilter({
        canReadAll: params.canReadAll,
        teamIds: params.viewerTeamIds,
      }),
      ...(normalizedSearch
        ? [
            or(
              ilike(schema.knowledgeBasesTable.name, `%${normalizedSearch}%`),
              ilike(
                schema.knowledgeBasesTable.description,
                `%${normalizedSearch}%`,
              ),
            ),
          ]
        : []),
    ];

    let query = db
      .select()
      .from(schema.knowledgeBasesTable)
      .where(and(...filters))
      .orderBy(desc(schema.knowledgeBasesTable.createdAt))
      .$dynamic();

    if (params.limit !== undefined) {
      query = query.limit(params.limit);
    }
    if (params.offset !== undefined) {
      query = query.offset(params.offset);
    }

    return await query;
  }

  static async findById(id: string): Promise<KnowledgeBase | null> {
    const [result] = await db
      .select()
      .from(schema.knowledgeBasesTable)
      .where(eq(schema.knowledgeBasesTable.id, id));

    return result ?? null;
  }

  static async findByIds(ids: string[]): Promise<KnowledgeBase[]> {
    if (ids.length === 0) return [];
    return await db
      .select()
      .from(schema.knowledgeBasesTable)
      .where(inArray(schema.knowledgeBasesTable.id, ids));
  }

  static async create(data: InsertKnowledgeBase): Promise<KnowledgeBase> {
    const [result] = await db
      .insert(schema.knowledgeBasesTable)
      .values(data)
      .returning();

    return result;
  }

  static async update(
    id: string,
    data: Partial<UpdateKnowledgeBase>,
  ): Promise<KnowledgeBase | null> {
    const [result] = await db
      .update(schema.knowledgeBasesTable)
      .set(data)
      .where(eq(schema.knowledgeBasesTable.id, id))
      .returning();

    return result ?? null;
  }

  static async delete(id: string): Promise<boolean> {
    const result = await db
      .delete(schema.knowledgeBasesTable)
      .where(eq(schema.knowledgeBasesTable.id, id));

    return result.rowCount !== null && result.rowCount > 0;
  }

  static async countByOrganization(params: {
    organizationId: string;
    search?: string;
    canReadAll?: boolean;
    viewerTeamIds?: string[];
  }): Promise<number> {
    const normalizedSearch = params.search?.trim();
    const filters = [
      eq(schema.knowledgeBasesTable.organizationId, params.organizationId),
      buildVisibilityFilter({
        canReadAll: params.canReadAll,
        teamIds: params.viewerTeamIds,
      }),
      ...(normalizedSearch
        ? [
            or(
              ilike(schema.knowledgeBasesTable.name, `%${normalizedSearch}%`),
              ilike(
                schema.knowledgeBasesTable.description,
                `%${normalizedSearch}%`,
              ),
            ),
          ]
        : []),
    ];

    const [result] = await db
      .select({ count: count() })
      .from(schema.knowledgeBasesTable)
      .where(and(...filters));

    return result?.count ?? 0;
  }
}

export default KnowledgeBaseModel;

function buildVisibilityFilter(params: {
  canReadAll?: boolean;
  teamIds?: string[];
}) {
  if (params.canReadAll) {
    return undefined;
  }

  if (!params.teamIds || params.teamIds.length === 0) {
    return sql`${schema.knowledgeBasesTable.visibility} != 'team-scoped'`;
  }

  const teamIds = sql.join(
    params.teamIds.map((teamId) => sql`${teamId}`),
    sql`, `,
  );

  return sql`(
    ${schema.knowledgeBasesTable.visibility} != 'team-scoped'
    OR ${schema.knowledgeBasesTable.teamIds} ?| ARRAY[${teamIds}]
  )`;
}
