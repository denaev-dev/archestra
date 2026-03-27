import { describe, expect, test } from "@/test";
import { resolveSessionExternalIdpToken } from "./session-external-idp-token";

describe("resolveSessionExternalIdpToken", () => {
  test("returns the matching session IdP token for the gateway", async ({
    makeOrganization,
    makeUser,
    makeMember,
    makeIdentityProvider,
    makeAgent,
    makeAccount,
  }) => {
    const org = await makeOrganization();
    const user = await makeUser();
    await makeMember(user.id, org.id, { role: "member" });

    const identityProvider = await makeIdentityProvider(org.id, {
      providerId: "okta-chat",
      oidcConfig: { clientId: "okta-client-id" },
    });
    const agent = await makeAgent({
      organizationId: org.id,
      identityProviderId: identityProvider.id,
    });

    await makeAccount(user.id, {
      providerId: "okta-chat",
      idToken: createJwt({ exp: futureExpSeconds() }),
    });
    await makeAccount(user.id, {
      providerId: "other-provider",
      idToken: createJwt({ exp: futureExpSeconds() }),
    });

    const result = await resolveSessionExternalIdpToken({
      agentId: agent.id,
      userId: user.id,
    });

    expect(result).toEqual({
      identityProviderId: identityProvider.id,
      providerId: "okta-chat",
      rawToken: expect.any(String),
    });
  });

  test("returns null when the matching IdP token is expired", async ({
    makeOrganization,
    makeUser,
    makeMember,
    makeIdentityProvider,
    makeAgent,
    makeAccount,
  }) => {
    const org = await makeOrganization();
    const user = await makeUser();
    await makeMember(user.id, org.id, { role: "member" });

    const identityProvider = await makeIdentityProvider(org.id, {
      providerId: "okta-expired",
      oidcConfig: { clientId: "okta-client-id" },
    });
    const agent = await makeAgent({
      organizationId: org.id,
      identityProviderId: identityProvider.id,
    });

    await makeAccount(user.id, {
      providerId: "okta-expired",
      idToken: createJwt({ exp: Math.floor(Date.now() / 1000) - 60 }),
    });

    const result = await resolveSessionExternalIdpToken({
      agentId: agent.id,
      userId: user.id,
    });

    expect(result).toBeNull();
  });
});

function createJwt(payload: Record<string, unknown>): string {
  return [
    base64UrlEncode({ alg: "none", typ: "JWT" }),
    base64UrlEncode(payload),
    "",
  ].join(".");
}

function base64UrlEncode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function futureExpSeconds(): number {
  return Math.floor(Date.now() / 1000) + 3600;
}
