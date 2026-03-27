import { jwtDecode } from "jwt-decode";
import logger from "@/logging";
import { AccountModel, AgentModel } from "@/models";
import { findExternalIdentityProviderById } from "@/services/external-idp-oidc";

export interface SessionExternalIdpToken {
  identityProviderId: string;
  providerId: string;
  rawToken: string;
}

export async function resolveSessionExternalIdpToken(params: {
  agentId: string;
  userId: string;
}): Promise<SessionExternalIdpToken | null> {
  const agent = await AgentModel.findById(params.agentId);
  if (!agent?.identityProviderId) {
    return null;
  }

  const identityProvider = await findExternalIdentityProviderById(
    agent.identityProviderId,
  );
  if (!identityProvider?.oidcConfig) {
    return null;
  }

  const account = await AccountModel.getLatestSsoAccountByUserIdAndProviderId(
    params.userId,
    identityProvider.providerId,
  );
  if (!account?.idToken) {
    return null;
  }

  if (isJwtExpired(account.idToken)) {
    logger.info(
      {
        agentId: params.agentId,
        userId: params.userId,
        identityProviderId: identityProvider.id,
        providerId: identityProvider.providerId,
      },
      "Session external IdP token is expired; falling back to internal gateway auth",
    );
    return null;
  }

  return {
    identityProviderId: identityProvider.id,
    providerId: identityProvider.providerId,
    rawToken: account.idToken,
  };
}

// =============================================================================
// Internal helpers
// =============================================================================

function isJwtExpired(token: string): boolean {
  try {
    const payload = jwtDecode<{ exp?: number }>(token);
    if (!payload.exp) {
      return false;
    }
    return payload.exp <= Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}
