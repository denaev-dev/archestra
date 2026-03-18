import type { FastifyInstanceWithZod } from "@/server";
import { createFastifyInstance } from "@/server";
import { afterEach, beforeEach, describe, expect, test } from "@/test";
import type { User } from "@/types";

describe("agent routes knowledge source access validation", () => {
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

    const { default: agentRoutes } = await import("./agent");
    await app.register(agentRoutes);
  });

  afterEach(async () => {
    await app.close();
  });

  test("POST /api/agents returns 404 when assigning a hidden connector", async ({
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
        name: "Hidden Connector",
        visibility: "team-scoped",
        teamIds: [hiddenTeam.id],
      },
    );

    const response = await app.inject({
      method: "POST",
      url: "/api/agents",
      payload: {
        name: "Connector Assignment Test Agent",
        scope: "personal",
        teams: [],
        knowledgeBaseIds: [],
        connectorIds: [hiddenConnector.id],
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        message: `Connector not found: ${hiddenConnector.id}`,
        type: "api_not_found_error",
      },
    });
  });

  test("PUT /api/agents/:id returns 404 when updating with a hidden connector", async ({
    makeAgent,
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
    const agent = await makeAgent({
      organizationId,
      authorId: user.id,
      scope: "personal",
      agentType: "mcp_gateway",
      teams: [],
    });

    const response = await app.inject({
      method: "PUT",
      url: `/api/agents/${agent.id}`,
      payload: {
        connectorIds: [hiddenConnector.id],
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({
      error: {
        message: `Connector not found: ${hiddenConnector.id}`,
        type: "api_not_found_error",
      },
    });
  });
});
