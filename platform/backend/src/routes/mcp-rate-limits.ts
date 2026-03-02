import { RouteId } from "@shared";
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { getMcpUsageForLimit } from "@/clients/mcp-rate-limit";
import { McpRateLimitModel } from "@/models";
import {
  ApiError,
  CreateMcpRateLimitSchema,
  constructResponseSchema,
  DeleteObjectResponseSchema,
  McpRateLimitTypeSchema,
  McpRateLimitWithUsageSchema,
  SelectMcpRateLimitSchema,
  UpdateMcpRateLimitSchema,
  UuidIdSchema,
} from "@/types";

const mcpRateLimitsRoutes: FastifyPluginAsyncZod = async (fastify) => {
  fastify.get(
    "/api/mcp-rate-limits",
    {
      schema: {
        operationId: RouteId.GetMcpRateLimits,
        description:
          "Get all MCP rate limits with optional filtering and live usage",
        tags: ["MCP Rate Limits"],
        querystring: z.object({
          agentId: z.string().optional(),
          limitType: McpRateLimitTypeSchema.optional(),
        }),
        response: constructResponseSchema(z.array(McpRateLimitWithUsageSchema)),
      },
    },
    async ({ query: { agentId, limitType } }, reply) => {
      const limits = await McpRateLimitModel.findAll({ agentId, limitType });

      const limitsWithUsage = await Promise.all(
        limits.map(async (limit) => {
          const mcpUsage = await getMcpUsageForLimit(limit.id);
          return { ...limit, mcpUsage };
        }),
      );

      return reply.send(limitsWithUsage);
    },
  );

  fastify.post(
    "/api/mcp-rate-limits",
    {
      schema: {
        operationId: RouteId.CreateMcpRateLimit,
        description: "Create a new MCP rate limit",
        tags: ["MCP Rate Limits"],
        body: CreateMcpRateLimitSchema,
        response: constructResponseSchema(SelectMcpRateLimitSchema),
      },
    },
    async ({ body }, reply) => {
      return reply.send(await McpRateLimitModel.create(body));
    },
  );

  fastify.get(
    "/api/mcp-rate-limits/:id",
    {
      schema: {
        operationId: RouteId.GetMcpRateLimit,
        description: "Get an MCP rate limit by ID",
        tags: ["MCP Rate Limits"],
        params: z.object({
          id: UuidIdSchema,
        }),
        response: constructResponseSchema(SelectMcpRateLimitSchema),
      },
    },
    async ({ params: { id } }, reply) => {
      const limit = await McpRateLimitModel.findById(id);

      if (!limit) {
        throw new ApiError(404, "MCP rate limit not found");
      }

      return reply.send(limit);
    },
  );

  fastify.patch(
    "/api/mcp-rate-limits/:id",
    {
      schema: {
        operationId: RouteId.UpdateMcpRateLimit,
        description: "Update an MCP rate limit",
        tags: ["MCP Rate Limits"],
        params: z.object({
          id: UuidIdSchema,
        }),
        body: UpdateMcpRateLimitSchema.partial(),
        response: constructResponseSchema(SelectMcpRateLimitSchema),
      },
    },
    async ({ params: { id }, body }, reply) => {
      const limit = await McpRateLimitModel.patch(id, body);

      if (!limit) {
        throw new ApiError(404, "MCP rate limit not found");
      }

      return reply.send(limit);
    },
  );

  fastify.delete(
    "/api/mcp-rate-limits/:id",
    {
      schema: {
        operationId: RouteId.DeleteMcpRateLimit,
        description: "Delete an MCP rate limit",
        tags: ["MCP Rate Limits"],
        params: z.object({
          id: UuidIdSchema,
        }),
        response: constructResponseSchema(DeleteObjectResponseSchema),
      },
    },
    async ({ params: { id } }, reply) => {
      const deleted = await McpRateLimitModel.delete(id);

      if (!deleted) {
        throw new ApiError(404, "MCP rate limit not found");
      }

      return reply.send({ success: true });
    },
  );
};

export default mcpRateLimitsRoutes;
