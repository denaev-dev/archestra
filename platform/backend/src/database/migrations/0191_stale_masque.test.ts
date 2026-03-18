import fs from "node:fs";
import path from "node:path";
import { sql } from "drizzle-orm";
import db, { schema } from "@/database";
import { describe, expect, test } from "@/test";

const migrationSql = fs.readFileSync(
  path.join(__dirname, "0191_uneven_pepper_potts.sql"),
  "utf-8",
);

async function runMigration() {
  const statements = migrationSql
    .split(";")
    .map((statement) => statement.trim())
    .filter((statement) => statement.includes("UPDATE"));

  for (const statement of statements) {
    await db.execute(sql.raw(`${statement};`));
  }
}

async function insertRole(params: {
  organizationId: string;
  roleId: string;
  roleName: string;
  permission: Record<string, string[]>;
}) {
  await db.insert(schema.organizationRolesTable).values({
    id: params.roleId,
    organizationId: params.organizationId,
    role: params.roleName,
    name: params.roleName,
    permission: JSON.stringify(params.permission),
  });
}

async function getRolePermission(
  roleId: string,
): Promise<Record<string, string[]>> {
  const [role] = await db
    .select({ permission: schema.organizationRolesTable.permission })
    .from(schema.organizationRolesTable)
    .where(sql`${schema.organizationRolesTable.id} = ${roleId}`);

  return JSON.parse(role.permission);
}

describe("0191 migration: knowledge source RBAC rename", () => {
  test("renames knowledgeBases to knowledgeSources and grants admin when create exists", async ({
    makeOrganization,
  }) => {
    const org = await makeOrganization();
    await insertRole({
      organizationId: org.id,
      roleId: "test-knowledge-bases-rename",
      roleName: "test_knowledge_bases_rename",
      permission: {
        knowledgeBases: ["read", "create", "update"],
        agent: ["read"],
      },
    });

    await runMigration();

    const permission = await getRolePermission("test-knowledge-bases-rename");
    expect(permission.knowledgeBases).toBeUndefined();
    expect(permission.knowledgeSources.sort()).toEqual([
      "admin",
      "create",
      "read",
      "update",
    ]);
    expect(permission.agent).toEqual(["read"]);
  });

  test("unions knowledgeBases into existing knowledgeSources before granting admin", async ({
    makeOrganization,
  }) => {
    const org = await makeOrganization();
    await insertRole({
      organizationId: org.id,
      roleId: "test-knowledge-sources-union",
      roleName: "test_knowledge_sources_union",
      permission: {
        knowledgeBases: ["create", "delete"],
        knowledgeSources: ["read", "update"],
      },
    });

    await runMigration();

    const permission = await getRolePermission("test-knowledge-sources-union");
    expect(permission.knowledgeBases).toBeUndefined();
    expect(permission.knowledgeSources.sort()).toEqual([
      "admin",
      "create",
      "delete",
      "read",
      "update",
    ]);
  });

  test("grants admin to existing knowledgeSources roles with create", async ({
    makeOrganization,
  }) => {
    const org = await makeOrganization();
    await insertRole({
      organizationId: org.id,
      roleId: "test-knowledge-sources-admin-grant",
      roleName: "test_knowledge_sources_admin_grant",
      permission: {
        knowledgeSources: ["create", "read"],
      },
    });

    await runMigration();

    const permission = await getRolePermission(
      "test-knowledge-sources-admin-grant",
    );
    expect(permission.knowledgeSources.sort()).toEqual([
      "admin",
      "create",
      "read",
    ]);
  });
});
