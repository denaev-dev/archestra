import { describe, expect, test } from "@/test";
import { knowledgeSourceAccessService } from "./source-access";

describe("knowledgeSourceAccessService", () => {
  test("allows org-wide knowledge sources for users with read access", async ({
    makeOrganization,
    makeUser,
    makeMember,
    makeKnowledgeBase,
    makeKnowledgeBaseConnector,
  }) => {
    const org = await makeOrganization();
    const user = await makeUser();
    await makeMember(user.id, org.id, { role: "member" });
    const knowledgeBase = await makeKnowledgeBase(org.id);
    const connector = await makeKnowledgeBaseConnector(
      knowledgeBase.id,
      org.id,
    );

    const access = await knowledgeSourceAccessService.buildAccessContext({
      userId: user.id,
      organizationId: org.id,
    });

    expect(
      knowledgeSourceAccessService.canAccessKnowledgeBase(
        access,
        knowledgeBase,
      ),
    ).toBe(true);
    expect(
      knowledgeSourceAccessService.canAccessConnector(access, connector),
    ).toBe(true);
  });

  test("blocks team-scoped knowledge sources when user is not in the team", async ({
    makeOrganization,
    makeUser,
    makeMember,
    makeTeam,
    makeKnowledgeBase,
    makeKnowledgeBaseConnector,
  }) => {
    const org = await makeOrganization();
    const user = await makeUser();
    await makeMember(user.id, org.id, { role: "member" });
    const team = await makeTeam(org.id, user.id);
    const knowledgeBase = await makeKnowledgeBase(org.id, {
      visibility: "team-scoped",
      teamIds: [team.id],
    });
    const connector = await makeKnowledgeBaseConnector(
      knowledgeBase.id,
      org.id,
      {
        visibility: "team-scoped",
        teamIds: [team.id],
      },
    );

    const access = await knowledgeSourceAccessService.buildAccessContext({
      userId: user.id,
      organizationId: org.id,
    });

    expect(
      knowledgeSourceAccessService.canAccessKnowledgeBase(
        access,
        knowledgeBase,
      ),
    ).toBe(false);
    expect(
      knowledgeSourceAccessService.canAccessConnector(access, connector),
    ).toBe(false);
  });

  test("knowledgeSources:admin bypasses source visibility restrictions", async ({
    makeOrganization,
    makeUser,
    makeMember,
    makeTeam,
    makeKnowledgeBase,
    makeKnowledgeBaseConnector,
  }) => {
    const org = await makeOrganization();
    const admin = await makeUser();
    await makeMember(admin.id, org.id, { role: "admin" });
    const team = await makeTeam(org.id, admin.id);
    const knowledgeBase = await makeKnowledgeBase(org.id, {
      visibility: "team-scoped",
      teamIds: [team.id],
    });
    const connector = await makeKnowledgeBaseConnector(
      knowledgeBase.id,
      org.id,
      {
        visibility: "team-scoped",
        teamIds: [team.id],
      },
    );

    const access = await knowledgeSourceAccessService.buildAccessContext({
      userId: admin.id,
      organizationId: org.id,
    });

    expect(access.canReadAll).toBe(true);
    expect(
      knowledgeSourceAccessService.canAccessKnowledgeBase(
        access,
        knowledgeBase,
      ),
    ).toBe(true);
    expect(
      knowledgeSourceAccessService.canAccessConnector(access, connector),
    ).toBe(true);
  });
});
