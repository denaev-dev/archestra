import { describe, expect, test } from "@/test";
import { CreateMcpRateLimitSchema } from "@/types";
import McpRateLimitModel from "./mcp-rate-limit";

describe("McpRateLimitModel", () => {
  describe("create", () => {
    test("creates an mcp_server_calls limit for an agent", async ({
      makeAgent,
    }) => {
      const agent = await makeAgent({ name: "Rate Limit Agent" });

      const limit = await McpRateLimitModel.create({
        agentId: agent.id,
        limitType: "mcp_server_calls",
        mcpServerName: "test-server",
        maxCalls: 100,
        windowSeconds: 3600,
      });

      expect(limit).toBeDefined();
      expect(limit.id).toBeDefined();
      expect(limit.agentId).toBe(agent.id);
      expect(limit.limitType).toBe("mcp_server_calls");
      expect(limit.mcpServerName).toBe("test-server");
      expect(limit.toolName).toBeNull();
      expect(limit.maxCalls).toBe(100);
      expect(limit.windowSeconds).toBe(3600);
      expect(limit.createdAt).toBeInstanceOf(Date);
      expect(limit.updatedAt).toBeInstanceOf(Date);
    });

    test("creates a tool_calls limit for an agent", async ({ makeAgent }) => {
      const agent = await makeAgent({ name: "Tool Limit Agent" });

      const limit = await McpRateLimitModel.create({
        agentId: agent.id,
        limitType: "tool_calls",
        mcpServerName: "test-server",
        toolName: "dangerous-tool",
        maxCalls: 10,
        windowSeconds: 60,
      });

      expect(limit).toBeDefined();
      expect(limit.limitType).toBe("tool_calls");
      expect(limit.mcpServerName).toBe("test-server");
      expect(limit.toolName).toBe("dangerous-tool");
      expect(limit.maxCalls).toBe(10);
      expect(limit.windowSeconds).toBe(60);
    });

    test("creates limits with different window presets", async ({
      makeAgent,
    }) => {
      const agent = await makeAgent({ name: "Window Test Agent" });
      const windows = [60, 3600, 86400, 604800, 2592000];

      for (const windowSeconds of windows) {
        const limit = await McpRateLimitModel.create({
          agentId: agent.id,
          limitType: "mcp_server_calls",
          mcpServerName: `server-${windowSeconds}`,
          maxCalls: 100,
          windowSeconds,
        });

        expect(limit.windowSeconds).toBe(windowSeconds);
      }
    });
  });

  describe("findByAgentId", () => {
    test("returns only limits for the specified agent", async ({
      makeAgent,
    }) => {
      const agent1 = await makeAgent({ name: "Agent 1" });
      const agent2 = await makeAgent({ name: "Agent 2" });

      await McpRateLimitModel.create({
        agentId: agent1.id,
        limitType: "mcp_server_calls",
        mcpServerName: "server-1",
        maxCalls: 100,
        windowSeconds: 3600,
      });
      await McpRateLimitModel.create({
        agentId: agent2.id,
        limitType: "mcp_server_calls",
        mcpServerName: "server-2",
        maxCalls: 200,
        windowSeconds: 3600,
      });

      const agent1Limits = await McpRateLimitModel.findByAgentId(agent1.id);
      expect(agent1Limits).toHaveLength(1);
      expect(agent1Limits[0].agentId).toBe(agent1.id);
      expect(agent1Limits[0].mcpServerName).toBe("server-1");
    });

    test("returns empty array for agent with no limits", async ({
      makeAgent,
    }) => {
      const agent = await makeAgent({ name: "No Limits Agent" });
      const limits = await McpRateLimitModel.findByAgentId(agent.id);
      expect(limits).toHaveLength(0);
    });
  });

  describe("findAll", () => {
    test("returns all limits with no filter", async ({ makeAgent }) => {
      const agent = await makeAgent({ name: "Find All Agent" });

      await McpRateLimitModel.create({
        agentId: agent.id,
        limitType: "mcp_server_calls",
        mcpServerName: "server-a",
        maxCalls: 100,
        windowSeconds: 3600,
      });
      await McpRateLimitModel.create({
        agentId: agent.id,
        limitType: "tool_calls",
        mcpServerName: "server-a",
        toolName: "tool-b",
        maxCalls: 50,
        windowSeconds: 60,
      });

      const limits = await McpRateLimitModel.findAll();
      expect(limits.length).toBeGreaterThanOrEqual(2);
    });

    test("filters by agentId", async ({ makeAgent }) => {
      const agent1 = await makeAgent({ name: "Filter Agent 1" });
      const agent2 = await makeAgent({ name: "Filter Agent 2" });

      await McpRateLimitModel.create({
        agentId: agent1.id,
        limitType: "mcp_server_calls",
        mcpServerName: "server",
        maxCalls: 100,
        windowSeconds: 3600,
      });
      await McpRateLimitModel.create({
        agentId: agent2.id,
        limitType: "mcp_server_calls",
        mcpServerName: "server",
        maxCalls: 200,
        windowSeconds: 3600,
      });

      const filtered = await McpRateLimitModel.findAll({
        agentId: agent1.id,
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].agentId).toBe(agent1.id);
    });

    test("filters by limitType", async ({ makeAgent }) => {
      const agent = await makeAgent({ name: "Type Filter Agent" });

      await McpRateLimitModel.create({
        agentId: agent.id,
        limitType: "mcp_server_calls",
        mcpServerName: "server",
        maxCalls: 100,
        windowSeconds: 3600,
      });
      await McpRateLimitModel.create({
        agentId: agent.id,
        limitType: "tool_calls",
        mcpServerName: "server",
        toolName: "tool",
        maxCalls: 50,
        windowSeconds: 60,
      });

      const filtered = await McpRateLimitModel.findAll({
        agentId: agent.id,
        limitType: "tool_calls",
      });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].limitType).toBe("tool_calls");
    });
  });

  describe("findById", () => {
    test("returns the limit when found", async ({ makeAgent }) => {
      const agent = await makeAgent({ name: "Find By Id Agent" });

      const created = await McpRateLimitModel.create({
        agentId: agent.id,
        limitType: "mcp_server_calls",
        mcpServerName: "server",
        maxCalls: 100,
        windowSeconds: 3600,
      });

      const found = await McpRateLimitModel.findById(created.id);
      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.maxCalls).toBe(100);
    });

    test("returns null for non-existent ID", async () => {
      const found = await McpRateLimitModel.findById(
        "00000000-0000-0000-0000-000000000000",
      );
      expect(found).toBeNull();
    });
  });

  describe("patch", () => {
    test("updates maxCalls", async ({ makeAgent }) => {
      const agent = await makeAgent({ name: "Patch Agent" });

      const limit = await McpRateLimitModel.create({
        agentId: agent.id,
        limitType: "mcp_server_calls",
        mcpServerName: "server",
        maxCalls: 100,
        windowSeconds: 3600,
      });

      const updated = await McpRateLimitModel.patch(limit.id, {
        maxCalls: 200,
      });
      expect(updated).not.toBeNull();
      expect(updated?.maxCalls).toBe(200);
    });

    test("updates windowSeconds", async ({ makeAgent }) => {
      const agent = await makeAgent({ name: "Patch Window Agent" });

      const limit = await McpRateLimitModel.create({
        agentId: agent.id,
        limitType: "mcp_server_calls",
        mcpServerName: "server",
        maxCalls: 100,
        windowSeconds: 3600,
      });

      const updated = await McpRateLimitModel.patch(limit.id, {
        windowSeconds: 86400,
      });
      expect(updated).not.toBeNull();
      expect(updated?.windowSeconds).toBe(86400);
    });
  });

  describe("delete", () => {
    test("removes the limit and returns true", async ({ makeAgent }) => {
      const agent = await makeAgent({ name: "Delete Agent" });

      const limit = await McpRateLimitModel.create({
        agentId: agent.id,
        limitType: "mcp_server_calls",
        mcpServerName: "server",
        maxCalls: 100,
        windowSeconds: 3600,
      });

      const deleted = await McpRateLimitModel.delete(limit.id);
      expect(deleted).toBe(true);

      const found = await McpRateLimitModel.findById(limit.id);
      expect(found).toBeNull();
    });

    test("returns false for non-existent ID", async () => {
      const deleted = await McpRateLimitModel.delete(
        "00000000-0000-0000-0000-000000000000",
      );
      expect(deleted).toBe(false);
    });
  });

  describe("cascade delete", () => {
    test("deleting the agent cascades to delete its limits", async ({
      makeAgent,
    }) => {
      const agent = await makeAgent({ name: "Cascade Agent" });

      const limit = await McpRateLimitModel.create({
        agentId: agent.id,
        limitType: "mcp_server_calls",
        mcpServerName: "server",
        maxCalls: 100,
        windowSeconds: 3600,
      });

      // Delete the agent (using AgentModel)
      const { AgentModel } = await import("@/models");
      await AgentModel.delete(agent.id);

      // The limit should be gone too
      const found = await McpRateLimitModel.findById(limit.id);
      expect(found).toBeNull();
    });
  });
});

describe("CreateMcpRateLimitSchema validation", () => {
  test("rejects tool_calls without toolName", () => {
    const result = CreateMcpRateLimitSchema.safeParse({
      agentId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      limitType: "tool_calls",
      mcpServerName: "server",
      maxCalls: 100,
      windowSeconds: 3600,
    });
    expect(result.success).toBe(false);
  });

  test("rejects maxCalls <= 0", () => {
    const result = CreateMcpRateLimitSchema.safeParse({
      agentId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      limitType: "mcp_server_calls",
      mcpServerName: "server",
      maxCalls: 0,
      windowSeconds: 3600,
    });
    expect(result.success).toBe(false);
  });

  test("rejects windowSeconds <= 0", () => {
    const result = CreateMcpRateLimitSchema.safeParse({
      agentId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      limitType: "mcp_server_calls",
      mcpServerName: "server",
      maxCalls: 100,
      windowSeconds: 0,
    });
    expect(result.success).toBe(false);
  });

  test("accepts valid mcp_server_calls config", () => {
    const result = CreateMcpRateLimitSchema.safeParse({
      agentId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      limitType: "mcp_server_calls",
      mcpServerName: "server",
      maxCalls: 100,
      windowSeconds: 3600,
    });
    expect(result.success).toBe(true);
  });

  test("accepts valid tool_calls config", () => {
    const result = CreateMcpRateLimitSchema.safeParse({
      agentId: "a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11",
      limitType: "tool_calls",
      mcpServerName: "server",
      toolName: "my-tool",
      maxCalls: 50,
      windowSeconds: 60,
    });
    expect(result.success).toBe(true);
  });
});
