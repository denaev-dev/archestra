import { RouteId, SecretsManagerType } from "@shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import logger from "@/logging";
import SecretModel from "@/models/secret";
import { isByosEnabled, secretManager } from "@/secrets-manager";
import { extractVaultErrorMessage } from "@/secrets-manager/utils";
import {
  ApiError,
  constructResponseSchema,
  SelectSecretSchema,
  UuidIdSchema,
} from "@/types";

const SecretsManagerTypeSchema = z.nativeEnum(SecretsManagerType);

const TestVaultConnectionResponseSchema = z.object({
  success: z.boolean(),
  message: z.string(),
});

const secretsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/api/secrets/type",
    {
      schema: {
        operationId: RouteId.GetSecretsType,
        description:
          "Get the secrets manager type and configuration details (for Vault)",
        tags: ["Secrets"],
        response: constructResponseSchema(
          z.object({
            type: SecretsManagerTypeSchema,
            meta: z.record(z.string(), z.string()),
          }),
        ),
      },
    },
    async (_request, reply) => {
      return reply.send(secretManager().getUserVisibleDebugInfo());
    },
  );

  fastify.get(
    "/api/secrets/:id",
    {
      schema: {
        operationId: RouteId.GetSecret,
        description: "Get a secret by ID",
        tags: ["Secrets"],
        params: z.object({
          id: UuidIdSchema,
        }),
        response: constructResponseSchema(SelectSecretSchema),
      },
    },
    async ({ params: { id } }, reply) => {
      // Security: Only allow access to secrets when BYOS is enabled or the secret is a BYOS secret.
      // This prevents exposing actual secret values (API keys, tokens, etc.) when BYOS is not enabled.
      // When BYOS is enabled, secrets contain vault references (safe to expose) rather than actual values.
      const secret = await SecretModel.findById(id);

      if (!secret) {
        throw new ApiError(404, "Secret not found");
      }

      // Only allow access if BYOS is enabled globally OR the secret is a BYOS secret
      if (!isByosEnabled() && !secret.isByosVault) {
        throw new ApiError(
          403,
          "Access to secrets is only allowed for BYOS (Bring Your Own Secrets) secrets when BYOS is enabled",
        );
      }

      // For BYOS secrets, we want to return the raw secret column (vault references)
      // without resolving them. Use SecretModel directly instead of secretManager
      // to avoid resolving vault references.
      return reply.send(secret);
    },
  );

  fastify.post(
    "/api/secrets/check-connectivity",
    {
      schema: {
        operationId: RouteId.CheckSecretsConnectivity,
        description:
          "Check connectivity to the secrets storage and return secret count.",
        tags: ["Secrets"],
        response: constructResponseSchema(
          z.object({
            secretCount: z.number(),
          }),
        ),
      },
    },
    async (_request, reply) => {
      const result = await secretManager().checkConnectivity();
      return reply.send(result);
    },
  );
  fastify.post(
    "/api/secrets/test-vault-connection",
    {
      schema: {
        operationId: RouteId.TestVaultConnection,
        description:
          "Test Vault connection by creating and deleting a test secret.",
        tags: ["Secrets"],
        response: constructResponseSchema(TestVaultConnectionResponseSchema),
      },
    },
    async (_request, reply) => {
      const manager = secretManager();
      if (manager.type !== SecretsManagerType.Vault) {
        throw new ApiError(
          400,
          "Test Vault connection is only available when using Vault secrets manager",
        );
      }

      try {
        const testSecret = await manager.createSecret(
          { test: "vault-connection-test" },
          `test-${Date.now()}`,
        );
        await manager.deleteSecret(testSecret.id);
      } catch (error) {
        const vaultError = extractVaultErrorMessage(error);
        logger.error(
          { error, vaultError },
          "testVaultConnection: failed",
        );
        throw new ApiError(
          502,
          `Vault connection test failed: ${vaultError}`,
        );
      }

      return reply.send({
        success: true,
        message:
          "Vault connection test passed. Successfully created and deleted a test secret.",
      });
    },
  );
};

export default secretsRoutes;
