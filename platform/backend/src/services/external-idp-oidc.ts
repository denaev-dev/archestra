import { eq } from "drizzle-orm";
import db, { schema as dbSchema } from "@/database";
import logger from "@/logging";

export interface ExternalIdentityProviderConfig {
  id: string;
  issuer: string;
  oidcConfig: ExternalIdentityProviderOidcConfig | null;
}

export interface ExternalIdentityProviderOidcConfig {
  clientId?: string;
  jwksEndpoint?: string;
}

export async function findExternalIdentityProviderById(
  identityProviderId: string,
): Promise<ExternalIdentityProviderConfig | null> {
  const [provider] = await db
    .select({
      id: dbSchema.identityProvidersTable.id,
      issuer: dbSchema.identityProvidersTable.issuer,
      oidcConfig: dbSchema.identityProvidersTable.oidcConfig,
    })
    .from(dbSchema.identityProvidersTable)
    .where(eq(dbSchema.identityProvidersTable.id, identityProviderId));

  if (!provider) {
    return null;
  }

  return {
    id: provider.id,
    issuer: provider.issuer,
    oidcConfig: parseJsonField<ExternalIdentityProviderOidcConfig>(
      provider.oidcConfig,
    ),
  };
}

export async function discoverOidcJwksUrl(
  issuerUrl: string,
): Promise<string | null> {
  const cached = oidcDiscoveryCache.get(issuerUrl);
  if (cached) return cached;

  const inflight = oidcDiscoveryInflight.get(issuerUrl);
  if (inflight) return inflight;

  const promise = fetchOidcJwksUrl(issuerUrl);
  oidcDiscoveryInflight.set(issuerUrl, promise);
  try {
    return await promise;
  } finally {
    oidcDiscoveryInflight.delete(issuerUrl);
  }
}

export function parseJsonField<T>(value: unknown): T | null {
  if (!value) return null;
  if (typeof value === "object") return value as T;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      return null;
    }
  }
  return null;
}

// =============================================================================
// Internal helpers
// =============================================================================

/**
 * Cache for OIDC discovery results (issuer → jwks_uri).
 * Bounded to MAX_OIDC_DISCOVERY_CACHE_SIZE entries with LRU-style eviction.
 */
const MAX_OIDC_DISCOVERY_CACHE_SIZE = 100;
const oidcDiscoveryCache = new Map<string, string>();
const oidcDiscoveryInflight = new Map<string, Promise<string | null>>();

async function fetchOidcJwksUrl(issuerUrl: string): Promise<string | null> {
  try {
    const normalizedIssuer = issuerUrl.replace(/\/$/, "");
    const discoveryUrl = `${normalizedIssuer}/.well-known/openid-configuration`;

    const response = await fetch(discoveryUrl, {
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) {
      logger.warn(
        { issuerUrl, status: response.status },
        "OIDC discovery failed",
      );
      return null;
    }

    const metadata = (await response.json()) as { jwks_uri?: string };
    const jwksUri = metadata.jwks_uri;
    if (!jwksUri || typeof jwksUri !== "string") {
      logger.warn({ issuerUrl }, "OIDC discovery: no jwks_uri in metadata");
      return null;
    }

    if (oidcDiscoveryCache.size >= MAX_OIDC_DISCOVERY_CACHE_SIZE) {
      const oldestKey = oidcDiscoveryCache.keys().next().value;
      if (oldestKey) oidcDiscoveryCache.delete(oldestKey);
    }
    oidcDiscoveryCache.set(issuerUrl, jwksUri);
    return jwksUri;
  } catch (error) {
    logger.warn(
      {
        issuerUrl,
        error: error instanceof Error ? error.message : String(error),
      },
      "OIDC discovery request failed",
    );
    return null;
  }
}
