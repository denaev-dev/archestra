import { KbChunkModel, KbDocumentModel } from "@/models";
import type { FastifyInstanceWithZod } from "@/server";
import { createFastifyInstance } from "@/server";
import { afterEach, beforeEach, describe, expect, test } from "@/test";
import type { User } from "@/types";

describe("knowledge base routes", () => {
  let app: FastifyInstanceWithZod;
  let user: User;
  let organizationId: string;

  beforeEach(async ({ makeOrganization, makeUser, makeMember }) => {
    const organization = await makeOrganization();
    organizationId = organization.id;
    user = await makeUser();
    await makeMember(user.id, organizationId, { role: "member" });

    app = createFastifyInstance();
    app.addHook("onRequest", async (request) => {
      (
        request as typeof request & {
          user: User;
          organizationId: string;
        }
      ).user = user;
      (
        request as typeof request & {
          user: User;
          organizationId: string;
        }
      ).organizationId = organizationId;
    });

    const { default: knowledgeBaseRoutes } = await import("./knowledge-base");
    await app.register(knowledgeBaseRoutes);
  });

  afterEach(async () => {
    await app.close();
  });

  test("GET /api/knowledge-bases returns all knowledge bases and filters nested connectors by visibility", async ({
    makeKnowledgeBase,
    makeKnowledgeBaseConnector,
    makeTeam,
    makeUser,
  }) => {
    const hiddenOwner = await makeUser();
    const hiddenTeam = await makeTeam(organizationId, hiddenOwner.id, {
      name: "Hidden Team",
    });

    const orgWideKb = await makeKnowledgeBase(organizationId, {
      name: "Org Wide KB",
    });
    const visibleTeamKb = await makeKnowledgeBase(organizationId, {
      name: "Visible Team KB",
    });
    const hiddenTeamKb = await makeKnowledgeBase(organizationId, {
      name: "Hidden Team KB",
    });
    const kbWithHiddenConnector = await makeKnowledgeBase(organizationId, {
      name: "KB With Hidden Connector",
    });

    const visibleConnector = await makeKnowledgeBaseConnector(
      orgWideKb.id,
      organizationId,
      {
        name: "Visible Connector",
        connectorType: "jira",
      },
    );
    await makeKnowledgeBaseConnector(visibleTeamKb.id, organizationId, {
      name: "Visible Team Connector",
      connectorType: "confluence",
    });
    await makeKnowledgeBaseConnector(hiddenTeamKb.id, organizationId, {
      name: "Hidden Team Connector",
      connectorType: "github",
    });
    await makeKnowledgeBaseConnector(kbWithHiddenConnector.id, organizationId, {
      name: "Hidden Connector On Visible KB",
      visibility: "team-scoped",
      teamIds: [hiddenTeam.id],
      connectorType: "gitlab",
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/knowledge-bases?limit=20&offset=0",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      data: Array<{
        name: string;
        connectors: Array<{ id: string; name: string; connectorType: string }>;
      }>;
      pagination: { total: number };
    };

    expect(body.pagination.total).toBe(4);
    expect(body.data.map((kb) => kb.name).sort()).toEqual([
      "Hidden Team KB",
      "KB With Hidden Connector",
      "Org Wide KB",
      "Visible Team KB",
    ]);
    expect(
      body.data.find((kb) => kb.name === "Org Wide KB")?.connectors,
    ).toEqual([
      {
        id: visibleConnector.id,
        name: "Visible Connector",
        connectorType: "jira",
      },
    ]);
    expect(
      body.data.find((kb) => kb.name === "KB With Hidden Connector")
        ?.connectors,
    ).toEqual([]);
  });

  test("GET /api/connectors filters hidden connectors from results", async ({
    makeKnowledgeBase,
    makeKnowledgeBaseConnector,
    makeTeam,
    makeUser,
  }) => {
    const hiddenOwner = await makeUser();
    const hiddenTeam = await makeTeam(organizationId, hiddenOwner.id);
    const kb = await makeKnowledgeBase(organizationId, { name: "Search KB" });

    const visibleConnector = await makeKnowledgeBaseConnector(
      kb.id,
      organizationId,
      {
        name: "Visible Connector",
      },
    );
    await makeKnowledgeBaseConnector(kb.id, organizationId, {
      name: "Hidden Connector",
      visibility: "team-scoped",
      teamIds: [hiddenTeam.id],
    });

    const response = await app.inject({
      method: "GET",
      url: "/api/connectors?limit=20&offset=0",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      data: Array<{ id: string; name: string }>;
      pagination: { total: number };
    };

    expect(body.pagination.total).toBe(1);
    expect(body.data).toEqual([
      expect.objectContaining({
        id: visibleConnector.id,
        name: "Visible Connector",
      }),
    ]);
  });

  test("GET /api/connectors/:id returns 404 for hidden team-scoped connector", async ({
    makeKnowledgeBase,
    makeKnowledgeBaseConnector,
    makeTeam,
    makeUser,
  }) => {
    const hiddenOwner = await makeUser();
    const hiddenTeam = await makeTeam(organizationId, hiddenOwner.id);
    const kb = await makeKnowledgeBase(organizationId);
    const hiddenConnector = await makeKnowledgeBaseConnector(
      kb.id,
      organizationId,
      {
        visibility: "team-scoped",
        teamIds: [hiddenTeam.id],
      },
    );

    const response = await app.inject({
      method: "GET",
      url: `/api/connectors/${hiddenConnector.id}`,
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        message: "Connector not found",
        type: "api_not_found_error",
      },
    });
  });

  test("PUT /api/connectors/:id refreshes document and chunk ACL when visibility changes", async ({
    makeKnowledgeBase,
    makeKnowledgeBaseConnector,
    makeTeam,
  }) => {
    const kb = await makeKnowledgeBase(organizationId);
    const connector = await makeKnowledgeBaseConnector(kb.id, organizationId);
    const team = await makeTeam(organizationId, user.id, {
      name: "Scoped Team",
    });
    const document = await KbDocumentModel.create({
      organizationId,
      sourceId: "ext-1",
      connectorId: connector.id,
      title: "Doc 1",
      content: "content",
      contentHash: "hash-1",
      acl: ["org:*"],
    });
    await KbChunkModel.insertMany([
      {
        documentId: document.id,
        content: "chunk 1",
        chunkIndex: 0,
        acl: ["org:*"],
      },
    ]);

    const response = await app.inject({
      method: "PUT",
      url: `/api/connectors/${connector.id}`,
      payload: {
        visibility: "team-scoped",
        teamIds: [team.id],
      },
    });

    expect(response.statusCode).toBe(200);
    const refreshedDocument = await KbDocumentModel.findById(document.id);
    const refreshedChunks = await KbChunkModel.findByDocument(document.id);
    expect(refreshedDocument?.acl).toEqual([`team:${team.id}`]);
    expect(refreshedChunks[0]?.acl).toEqual([`team:${team.id}`]);
  });
});
