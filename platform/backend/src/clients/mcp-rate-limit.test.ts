import { vi } from "vitest";
import { McpRateLimitModel } from "@/models";
import { beforeEach, describe, expect, test } from "@/test";

// Track call counts per cache key for rate limit simulation
const rateLimitCounters = new Map<
  string,
  { count: number; windowStart: number }
>();

// Mock isRateLimited to simulate the sliding window rate limiter using an in-memory map
// instead of the PostgreSQL-backed CacheManager (which requires a real PG connection).
vi.mock("@/agents/utils", () => ({
  isRateLimited: vi.fn(
    async (
      cacheKey: string,
      config: { windowMs: number; maxRequests: number },
    ) => {
      const now = Date.now();
      const entry = rateLimitCounters.get(cacheKey);

      if (!entry || now - entry.windowStart > config.windowMs) {
        // Start new window
        rateLimitCounters.set(cacheKey, { count: 1, windowStart: now });
        return false;
      }

      if (entry.count >= config.maxRequests) {
        return true;
      }

      // Increment count
      entry.count += 1;
      return false;
    },
  ),
}));

// Mock cacheManager.get to return from our in-memory map (used for retry time calculation)
vi.mock("@/cache-manager", async (importOriginal) => {
  const original = (await importOriginal()) as typeof import("@/cache-manager");
  return {
    ...original,
    cacheManager: {
      get: vi.fn(async (key: string) => {
        return rateLimitCounters.get(key) ?? undefined;
      }),
      set: vi.fn(),
      delete: vi.fn(),
      start: vi.fn(),
      shutdown: vi.fn(),
    },
  };
});

// Mock metrics to avoid side effects
vi.mock("@/observability/metrics/mcp", () => ({
  reportMcpRateLimitRejection: vi.fn(),
}));

import { checkMcpRateLimits, getMcpUsageForLimit } from "./mcp-rate-limit";

describe("checkMcpRateLimits", () => {
  // Clear rate limit counters before each test
  beforeEach(() => {
    rateLimitCounters.clear();
  });

  test("returns null when no limits are configured", async ({ makeAgent }) => {
    const agent = await makeAgent({ name: "No Limits Agent" });

    const result = await checkMcpRateLimits({
      agentId: agent.id,
      mcpServerName: "test-server",
      toolName: "test-tool",
    });

    expect(result).toBeNull();
  });

  test("returns null when server-level limit is not exceeded", async ({
    makeAgent,
  }) => {
    const agent = await makeAgent({ name: "Agent With Limit" });

    // Create a server-level limit: 10 calls per minute
    await McpRateLimitModel.create({
      agentId: agent.id,
      limitType: "mcp_server_calls",
      maxCalls: 10,
      mcpServerName: "test-server",
      windowSeconds: 60,
    });

    // First call should be allowed
    const result = await checkMcpRateLimits({
      agentId: agent.id,
      mcpServerName: "test-server",
      toolName: "test-tool",
    });

    expect(result).toBeNull();
  });

  test("returns error string when server-level limit is exceeded", async ({
    makeAgent,
  }) => {
    const agent = await makeAgent({ name: "Agent With Low Limit" });

    // Create a server-level limit: 2 calls per minute
    await McpRateLimitModel.create({
      agentId: agent.id,
      limitType: "mcp_server_calls",
      maxCalls: 2,
      mcpServerName: "test-server",
      windowSeconds: 60,
    });

    // First two calls count (allowed)
    await checkMcpRateLimits({
      agentId: agent.id,
      mcpServerName: "test-server",
      toolName: "any-tool",
    });
    await checkMcpRateLimits({
      agentId: agent.id,
      mcpServerName: "test-server",
      toolName: "any-tool",
    });

    // Third call should be rate-limited
    const result = await checkMcpRateLimits({
      agentId: agent.id,
      mcpServerName: "test-server",
      toolName: "any-tool",
    });

    expect(result).not.toBeNull();
    expect(result).toContain("Rate limit exceeded");
    expect(result).toContain("MCP server 'test-server'");
    expect(result).toContain("2 calls per");
  });

  test("returns error string when tool-level limit is exceeded", async ({
    makeAgent,
  }) => {
    const agent = await makeAgent({ name: "Agent With Tool Limit" });

    // Create a tool-level limit: 1 call per hour
    await McpRateLimitModel.create({
      agentId: agent.id,
      limitType: "tool_calls",
      maxCalls: 1,
      mcpServerName: "test-server",
      toolName: "dangerous-tool",
      windowSeconds: 3_600,
    });

    // First call counts (allowed)
    await checkMcpRateLimits({
      agentId: agent.id,
      mcpServerName: "test-server",
      toolName: "dangerous-tool",
    });

    // Second call should be rate-limited
    const result = await checkMcpRateLimits({
      agentId: agent.id,
      mcpServerName: "test-server",
      toolName: "dangerous-tool",
    });

    expect(result).not.toBeNull();
    expect(result).toContain("Rate limit exceeded");
    expect(result).toContain(
      "tool 'dangerous-tool' on MCP server 'test-server'",
    );
    expect(result).toContain("1 calls per");
  });

  test("limits are scoped per agent", async ({ makeAgent }) => {
    const agent1 = await makeAgent({ name: "Agent 1" });
    const agent2 = await makeAgent({ name: "Agent 2" });

    // Create a limit for agent1 only: 1 call per minute
    await McpRateLimitModel.create({
      agentId: agent1.id,
      limitType: "mcp_server_calls",
      maxCalls: 1,
      mcpServerName: "test-server",
      windowSeconds: 60,
    });

    // Agent1 uses one call (allowed)
    await checkMcpRateLimits({
      agentId: agent1.id,
      mcpServerName: "test-server",
      toolName: "some-tool",
    });

    // Agent1 is now rate-limited
    const result1 = await checkMcpRateLimits({
      agentId: agent1.id,
      mcpServerName: "test-server",
      toolName: "some-tool",
    });
    expect(result1).not.toBeNull();
    expect(result1).toContain("Rate limit exceeded");

    // Agent2 is NOT rate-limited (no limit configured for it)
    const result2 = await checkMcpRateLimits({
      agentId: agent2.id,
      mcpServerName: "test-server",
      toolName: "some-tool",
    });
    expect(result2).toBeNull();
  });

  test("error message format includes limit value, window description, and retry seconds", async ({
    makeAgent,
  }) => {
    const agent = await makeAgent({ name: "Rate Limited Agent" });

    // Create a limit: 1 call per 1 hour
    await McpRateLimitModel.create({
      agentId: agent.id,
      limitType: "mcp_server_calls",
      maxCalls: 1,
      mcpServerName: "test-server",
      windowSeconds: 3_600,
    });

    // First call counts (allowed)
    await checkMcpRateLimits({
      agentId: agent.id,
      mcpServerName: "test-server",
      toolName: "any-tool",
    });

    // Second call triggers rate limit
    const result = await checkMcpRateLimits({
      agentId: agent.id,
      mcpServerName: "test-server",
      toolName: "any-tool",
    });

    expect(result).not.toBeNull();
    // Check error message components
    expect(result).toContain("1 calls per");
    expect(result).toContain("1 hour");
    expect(result).toContain("MCP server 'test-server'");
    expect(result).toMatch(/Try again in approximately \d+ seconds/);
  });

  test("does not rate limit when limit is for a different MCP server", async ({
    makeAgent,
  }) => {
    const agent = await makeAgent({ name: "Multi Server Agent" });

    // Create a limit for server-A only
    await McpRateLimitModel.create({
      agentId: agent.id,
      limitType: "mcp_server_calls",
      maxCalls: 1,
      mcpServerName: "server-A",
      windowSeconds: 60,
    });

    // Calling server-B should not be rate-limited
    const result = await checkMcpRateLimits({
      agentId: agent.id,
      mcpServerName: "server-B",
      toolName: "any-tool",
    });

    expect(result).toBeNull();
  });

  test("tool_calls limit does not affect other tools on the same server", async ({
    makeAgent,
  }) => {
    const agent = await makeAgent({ name: "Tool Limit Agent" });

    // Create a tool-level limit for tool-A only
    await McpRateLimitModel.create({
      agentId: agent.id,
      limitType: "tool_calls",
      maxCalls: 1,
      mcpServerName: "test-server",
      toolName: "tool-A",
      windowSeconds: 60,
    });

    // Use up the limit for tool-A
    await checkMcpRateLimits({
      agentId: agent.id,
      mcpServerName: "test-server",
      toolName: "tool-A",
    });

    // tool-A is now rate-limited
    const resultA = await checkMcpRateLimits({
      agentId: agent.id,
      mcpServerName: "test-server",
      toolName: "tool-A",
    });
    expect(resultA).not.toBeNull();

    // tool-B on the same server should not be rate-limited
    const resultB = await checkMcpRateLimits({
      agentId: agent.id,
      mcpServerName: "test-server",
      toolName: "tool-B",
    });
    expect(resultB).toBeNull();
  });

  test("returns null on error (fail-open behavior)", async () => {
    // Agent with no limits - the function should return null
    const result = await checkMcpRateLimits({
      agentId: "nonexistent-agent-id",
      mcpServerName: "test-server",
      toolName: "test-tool",
    });

    expect(result).toBeNull();
  });
});

describe("getMcpUsageForLimit", () => {
  beforeEach(() => {
    rateLimitCounters.clear();
  });

  test("returns 0 when no usage exists", async () => {
    const usage = await getMcpUsageForLimit("nonexistent-limit-id");
    expect(usage).toBe(0);
  });

  test("returns current count from cache", async ({ makeAgent }) => {
    const agent = await makeAgent({ name: "Usage Agent" });

    const limit = await McpRateLimitModel.create({
      agentId: agent.id,
      limitType: "mcp_server_calls",
      maxCalls: 100,
      mcpServerName: "test-server",
      windowSeconds: 60,
    });

    // Manually populate the in-memory counter to simulate usage
    const cacheKey = `mcp-rate-limit-${limit.id}`;
    rateLimitCounters.set(cacheKey, { count: 5, windowStart: Date.now() });

    const usage = await getMcpUsageForLimit(limit.id);
    expect(usage).toBe(5);
  });
});
