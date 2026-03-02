import { isRateLimited, type RateLimitEntry } from "@/agents/utils";
import { type AllowedCacheKey, CacheKey, cacheManager } from "@/cache-manager";
import logger from "@/logging";
import { AgentModel, McpRateLimitModel } from "@/models";
import { reportMcpRateLimitRejection } from "@/observability/metrics/mcp";
import type { McpRateLimit } from "@/types";

/**
 * Check MCP rate limits for a tool call before execution.
 *
 * Looks up limits directly on the agent (profile/MCP gateway) for both
 * mcp_server_calls and tool_calls limit types.
 *
 * @returns null if allowed, or an error message string if rate-limited
 */
export async function checkMcpRateLimits(params: {
  agentId: string;
  mcpServerName: string;
  toolName: string;
}): Promise<string | null> {
  const { agentId, mcpServerName, toolName } = params;

  try {
    // Fetch all limits for this agent in a single query
    const agentLimits = await McpRateLimitModel.findByAgentId(agentId);

    // Filter to only limits that match this server/tool
    const mcpLimits = filterMatchingMcpLimits(
      agentLimits,
      mcpServerName,
      toolName,
    );

    if (mcpLimits.length === 0) {
      return null;
    }

    // Check each limit
    for (const limit of mcpLimits) {
      const cacheKey =
        `${CacheKey.McpRateLimit}-${limit.id}` as AllowedCacheKey;
      const windowMs = limit.windowSeconds * 1000;

      const rateLimited = await isRateLimited(cacheKey, {
        windowMs,
        maxRequests: limit.maxCalls,
      });

      if (rateLimited) {
        // Calculate approximate retry time
        const entry = await cacheManager.get<RateLimitEntry>(cacheKey);
        const remainingMs = entry
          ? Math.max(0, windowMs - (Date.now() - entry.windowStart))
          : windowMs;
        const remainingSeconds = Math.ceil(remainingMs / 1000);

        const windowDescription = formatWindowSeconds(limit.windowSeconds);
        const limitTarget =
          limit.limitType === "tool_calls"
            ? `tool '${toolName}' on MCP server '${mcpServerName}'`
            : `MCP server '${mcpServerName}'`;

        // Look up agent name for human-readable metric labels (only on rejection path)
        const agent = await AgentModel.findById(agentId);
        const agentName = agent?.name ?? agentId;

        // Report metric
        reportMcpRateLimitRejection({
          agentId,
          agentName,
          mcpServerName,
          toolName,
          limitType: limit.limitType,
          entityType: "agent",
        });

        logger.info(
          {
            limitId: limit.id,
            agentId,
            mcpServerName,
            toolName,
            limitType: limit.limitType,
          },
          `MCP rate limit exceeded for ${limitTarget}`,
        );

        return `Rate limit exceeded for ${limitTarget}: ${limit.maxCalls} calls per ${windowDescription}. Try again in approximately ${remainingSeconds} seconds.`;
      }
    }

    return null;
  } catch (error) {
    logger.error(
      { error, agentId, mcpServerName, toolName },
      "Error checking MCP rate limits, allowing request",
    );
    // Allow request on error to avoid blocking tool calls due to rate limit infrastructure issues
    return null;
  }
}

/**
 * Get the current usage count for a specific MCP rate limit.
 * Used by the API to display usage on the frontend.
 */
export async function getMcpUsageForLimit(limitId: string): Promise<number> {
  const cacheKey = `${CacheKey.McpRateLimit}-${limitId}` as AllowedCacheKey;
  const entry = await cacheManager.get<RateLimitEntry>(cacheKey);
  return entry?.count ?? 0;
}

// --- Internal helpers ---

function filterMatchingMcpLimits(
  limits: McpRateLimit[],
  mcpServerName: string,
  toolName: string,
): McpRateLimit[] {
  return limits.filter((limit) => {
    if (
      limit.limitType === "mcp_server_calls" &&
      limit.mcpServerName === mcpServerName
    ) {
      return true;
    }
    if (
      limit.limitType === "tool_calls" &&
      limit.mcpServerName === mcpServerName &&
      limit.toolName === toolName
    ) {
      return true;
    }
    return false;
  });
}

function formatWindowSeconds(seconds: number): string {
  if (seconds < 60) return `${seconds} second${seconds !== 1 ? "s" : ""}`;
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    return `${minutes} minute${minutes !== 1 ? "s" : ""}`;
  }
  if (seconds < 86400) {
    const hours = Math.floor(seconds / 3600);
    return `${hours} hour${hours !== 1 ? "s" : ""}`;
  }
  if (seconds < 604800) {
    const days = Math.floor(seconds / 86400);
    return `${days} day${days !== 1 ? "s" : ""}`;
  }
  if (seconds < 2592000) {
    const weeks = Math.round(seconds / 604800);
    return `${weeks} week${weeks !== 1 ? "s" : ""}`;
  }
  const months = Math.round(seconds / 2592000);
  return `${months} month${months !== 1 ? "s" : ""}`;
}
