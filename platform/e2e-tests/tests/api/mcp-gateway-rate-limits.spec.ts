import crypto from "node:crypto";
import {
  MCP_GATEWAY_URL_SUFFIX,
  MCP_SERVER_TOOL_NAME_SEPARATOR,
} from "../../consts";
import { expect, test } from "./fixtures";
import {
  assignArchestraToolsToProfile,
  callMcpTool,
  getOrgTokenForProfile,
  initializeMcpSession,
  makeApiRequest,
} from "./mcp-gateway-utils";

/**
 * MCP Gateway Rate Limit Tests
 *
 * Tests that MCP rate limits (mcp_server_calls and tool_calls) are enforced
 * when calling tools via the MCP Gateway.
 *
 * Uses the built-in archestra__whoami tool which requires no external dependencies.
 */

const ARCHESTRA_MCP_SERVER_NAME = "archestra";
const WHOAMI_TOOL_NAME = `${ARCHESTRA_MCP_SERVER_NAME}${MCP_SERVER_TOOL_NAME_SEPARATOR}whoami`;

test.describe("MCP Gateway - Rate Limits", () => {
  let profileId: string;
  let archestraToken: string;

  test.beforeAll(async ({ request, createAgent }) => {
    // Create a dedicated profile for rate limit testing
    const uniqueSuffix = crypto.randomUUID().slice(0, 8);
    const createResponse = await createAgent(
      request,
      `MCP Rate Limit Test ${uniqueSuffix}`,
    );
    const profile = await createResponse.json();
    profileId = profile.id;

    // Assign Archestra tools to the profile (required for tools/call to work)
    await assignArchestraToolsToProfile(request, profileId);

    // Get org token for MCP Gateway authentication
    archestraToken = await getOrgTokenForProfile(request);

    // Initialize MCP session (stateless, but verifies profile is accessible)
    await initializeMcpSession(request, {
      profileId,
      token: archestraToken,
    });
  });

  test.afterAll(async ({ request, deleteAgent }) => {
    await deleteAgent(request, profileId);
  });

  test("mcp_server_calls limit blocks calls after threshold is exceeded", async ({
    request,
  }) => {
    const limitThreshold = 2;
    const windowSeconds = 60; // 1 minute

    // Step 1: Create an mcp_server_calls rate limit with a low threshold
    const createLimitResponse = await makeApiRequest({
      request,
      method: "post",
      urlSuffix: "/api/mcp-rate-limits",
      data: {
        agentId: profileId,
        limitType: "mcp_server_calls",
        maxCalls: limitThreshold,
        mcpServerName: ARCHESTRA_MCP_SERVER_NAME,
        windowSeconds,
      },
    });
    expect(createLimitResponse.status()).toBe(200);
    const limit = await createLimitResponse.json();
    const limitId = limit.id;

    try {
      // Step 2: Make calls within the limit - these should succeed
      for (let i = 0; i < limitThreshold; i++) {
        const result = await callMcpTool(request, {
          profileId,
          token: archestraToken,
          toolName: WHOAMI_TOOL_NAME,
        });

        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);
        const textContent = result.content.find(
          // biome-ignore lint/suspicious/noExplicitAny: for a test it's okay..
          (c: any) => c.type === "text",
        );
        expect(textContent).toBeDefined();
        expect(textContent?.text).toContain(profileId);
      }

      // Step 3: The next call should be rate-limited
      // callMcpTool throws on JSON-RPC errors, but rate limit errors are returned
      // as tool results with isError: true, so we need to use the raw API
      const rateLimitedResponse = await makeApiRequest({
        request,
        method: "post",
        urlSuffix: `${MCP_GATEWAY_URL_SUFFIX}/${profileId}`,
        headers: {
          Authorization: `Bearer ${archestraToken}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        data: {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: WHOAMI_TOOL_NAME,
            arguments: {},
          },
        },
      });

      expect(rateLimitedResponse.status()).toBe(200);
      const rateLimitedResult = await rateLimitedResponse.json();

      // The rate limit error is returned as a tool result with isError: true
      expect(rateLimitedResult.result).toBeDefined();
      expect(rateLimitedResult.result.content).toBeDefined();
      expect(rateLimitedResult.result.isError).toBe(true);

      const errorContent = rateLimitedResult.result.content.find(
        // biome-ignore lint/suspicious/noExplicitAny: for a test it's okay..
        (c: any) => c.type === "text",
      );
      expect(errorContent).toBeDefined();
      expect(errorContent.text).toContain("Rate limit exceeded");
      expect(errorContent.text).toContain(ARCHESTRA_MCP_SERVER_NAME);
      expect(errorContent.text).toContain(`${limitThreshold} calls per`);
      expect(errorContent.text).toContain("Try again in approximately");
    } finally {
      // Step 4: Clean up the rate limit
      await makeApiRequest({
        request,
        method: "delete",
        urlSuffix: `/api/mcp-rate-limits/${limitId}`,
      });
    }
  });

  test("tool_calls limit blocks calls after threshold for a specific tool", async ({
    request,
  }) => {
    const limitThreshold = 2;
    const windowSeconds = 60; // 1 minute

    // Step 1: Create a tool_calls rate limit targeting the specific whoami tool
    const createLimitResponse = await makeApiRequest({
      request,
      method: "post",
      urlSuffix: "/api/mcp-rate-limits",
      data: {
        agentId: profileId,
        limitType: "tool_calls",
        maxCalls: limitThreshold,
        mcpServerName: ARCHESTRA_MCP_SERVER_NAME,
        toolName: WHOAMI_TOOL_NAME,
        windowSeconds,
      },
    });
    expect(createLimitResponse.status()).toBe(200);
    const limit = await createLimitResponse.json();
    const limitId = limit.id;

    try {
      // Step 2: Make calls within the limit - these should succeed
      for (let i = 0; i < limitThreshold; i++) {
        const result = await callMcpTool(request, {
          profileId,
          token: archestraToken,
          toolName: WHOAMI_TOOL_NAME,
        });

        expect(result.content).toBeDefined();
        expect(result.content.length).toBeGreaterThan(0);
        const textContent = result.content.find(
          // biome-ignore lint/suspicious/noExplicitAny: for a test it's okay..
          (c: any) => c.type === "text",
        );
        expect(textContent).toBeDefined();
        expect(textContent?.text).toContain(profileId);
      }

      // Step 3: The next call should be rate-limited
      const rateLimitedResponse = await makeApiRequest({
        request,
        method: "post",
        urlSuffix: `${MCP_GATEWAY_URL_SUFFIX}/${profileId}`,
        headers: {
          Authorization: `Bearer ${archestraToken}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        data: {
          jsonrpc: "2.0",
          id: 3,
          method: "tools/call",
          params: {
            name: WHOAMI_TOOL_NAME,
            arguments: {},
          },
        },
      });

      expect(rateLimitedResponse.status()).toBe(200);
      const rateLimitedResult = await rateLimitedResponse.json();

      // Verify the rate limit error for tool_calls includes the tool name
      expect(rateLimitedResult.result).toBeDefined();
      expect(rateLimitedResult.result.isError).toBe(true);

      const errorContent = rateLimitedResult.result.content.find(
        // biome-ignore lint/suspicious/noExplicitAny: for a test it's okay..
        (c: any) => c.type === "text",
      );
      expect(errorContent).toBeDefined();
      expect(errorContent.text).toContain("Rate limit exceeded");
      expect(errorContent.text).toContain(`tool '${WHOAMI_TOOL_NAME}'`);
      expect(errorContent.text).toContain(ARCHESTRA_MCP_SERVER_NAME);
    } finally {
      // Step 4: Clean up the rate limit
      await makeApiRequest({
        request,
        method: "delete",
        urlSuffix: `/api/mcp-rate-limits/${limitId}`,
      });
    }
  });

  test("calls succeed normally when no rate limit is configured", async ({
    request,
  }) => {
    // Verify that without any rate limit, the tool call succeeds
    const result = await callMcpTool(request, {
      profileId,
      token: archestraToken,
      toolName: WHOAMI_TOOL_NAME,
    });

    expect(result.content).toBeDefined();
    expect(result.content.length).toBeGreaterThan(0);
    const textContent = result.content.find(
      // biome-ignore lint/suspicious/noExplicitAny: for a test it's okay..
      (c: any) => c.type === "text",
    );
    expect(textContent).toBeDefined();
    expect(textContent?.text).toContain(profileId);
  });

  test("rate limit usage is reflected in the MCP rate limits API response", async ({
    request,
  }) => {
    const limitThreshold = 5;
    const windowSeconds = 60; // 1 minute

    // Step 1: Create an mcp_server_calls rate limit
    const createLimitResponse = await makeApiRequest({
      request,
      method: "post",
      urlSuffix: "/api/mcp-rate-limits",
      data: {
        agentId: profileId,
        limitType: "mcp_server_calls",
        maxCalls: limitThreshold,
        mcpServerName: ARCHESTRA_MCP_SERVER_NAME,
        windowSeconds,
      },
    });
    expect(createLimitResponse.status()).toBe(200);
    const limit = await createLimitResponse.json();
    const limitId = limit.id;

    try {
      // Step 2: Make a single call to increment usage
      await callMcpTool(request, {
        profileId,
        token: archestraToken,
        toolName: WHOAMI_TOOL_NAME,
      });

      // Step 3: Check the MCP rate limits API to verify usage is tracked
      const limitsResponse = await makeApiRequest({
        request,
        method: "get",
        urlSuffix: `/api/mcp-rate-limits?agentId=${profileId}`,
      });
      expect(limitsResponse.status()).toBe(200);
      const limits = await limitsResponse.json();

      const createdLimit = limits.find(
        // biome-ignore lint/suspicious/noExplicitAny: for a test it's okay..
        (l: any) => l.id === limitId,
      );
      expect(createdLimit).toBeDefined();
      expect(createdLimit.limitType).toBe("mcp_server_calls");
      expect(createdLimit.mcpServerName).toBe(ARCHESTRA_MCP_SERVER_NAME);
      // mcpUsage should be at least 1 (may be higher if other tests ran in parallel)
      expect(createdLimit.mcpUsage).toBeGreaterThanOrEqual(1);
    } finally {
      // Step 4: Clean up the rate limit
      await makeApiRequest({
        request,
        method: "delete",
        urlSuffix: `/api/mcp-rate-limits/${limitId}`,
      });
    }
  });
});

test.describe("MCP Rate Limits - CRUD API", () => {
  let profileId: string;

  test.beforeAll(async ({ request, createAgent }) => {
    const uniqueSuffix = crypto.randomUUID().slice(0, 8);
    const createResponse = await createAgent(
      request,
      `MCP Rate Limit CRUD Test ${uniqueSuffix}`,
    );
    const profile = await createResponse.json();
    profileId = profile.id;
  });

  test.afterAll(async ({ request, deleteAgent }) => {
    await deleteAgent(request, profileId);
  });

  test("creates an mcp_server_calls limit", async ({ request }) => {
    const response = await makeApiRequest({
      request,
      method: "post",
      urlSuffix: "/api/mcp-rate-limits",
      data: {
        agentId: profileId,
        limitType: "mcp_server_calls",
        maxCalls: 100,
        mcpServerName: "test-server",
        windowSeconds: 3600,
      },
    });
    expect(response.status()).toBe(200);
    const limit = await response.json();
    expect(limit.id).toBeDefined();
    expect(limit.agentId).toBe(profileId);
    expect(limit.limitType).toBe("mcp_server_calls");
    expect(limit.maxCalls).toBe(100);
    expect(limit.mcpServerName).toBe("test-server");
    expect(limit.windowSeconds).toBe(3600);

    // Cleanup
    await makeApiRequest({
      request,
      method: "delete",
      urlSuffix: `/api/mcp-rate-limits/${limit.id}`,
    });
  });

  test("creates a tool_calls limit with toolName", async ({ request }) => {
    const response = await makeApiRequest({
      request,
      method: "post",
      urlSuffix: "/api/mcp-rate-limits",
      data: {
        agentId: profileId,
        limitType: "tool_calls",
        maxCalls: 50,
        mcpServerName: "test-server",
        toolName: "my-tool",
        windowSeconds: 60,
      },
    });
    expect(response.status()).toBe(200);
    const limit = await response.json();
    expect(limit.toolName).toBe("my-tool");
    expect(limit.limitType).toBe("tool_calls");

    // Cleanup
    await makeApiRequest({
      request,
      method: "delete",
      urlSuffix: `/api/mcp-rate-limits/${limit.id}`,
    });
  });

  test("lists limits filtered by agentId with mcpUsage field", async ({
    request,
  }) => {
    // Create two limits
    const limit1Resp = await makeApiRequest({
      request,
      method: "post",
      urlSuffix: "/api/mcp-rate-limits",
      data: {
        agentId: profileId,
        limitType: "mcp_server_calls",
        maxCalls: 100,
        mcpServerName: "server-a",
        windowSeconds: 3600,
      },
    });
    const limit1 = await limit1Resp.json();

    const limit2Resp = await makeApiRequest({
      request,
      method: "post",
      urlSuffix: "/api/mcp-rate-limits",
      data: {
        agentId: profileId,
        limitType: "tool_calls",
        maxCalls: 50,
        mcpServerName: "server-a",
        toolName: "tool-a",
        windowSeconds: 60,
      },
    });
    const limit2 = await limit2Resp.json();

    try {
      const listResponse = await makeApiRequest({
        request,
        method: "get",
        urlSuffix: `/api/mcp-rate-limits?agentId=${profileId}`,
      });
      expect(listResponse.status()).toBe(200);
      const limits = await listResponse.json();

      expect(limits.length).toBeGreaterThanOrEqual(2);
      // biome-ignore lint/suspicious/noExplicitAny: for a test it's okay..
      const ids = limits.map((l: any) => l.id);
      expect(ids).toContain(limit1.id);
      expect(ids).toContain(limit2.id);

      // All limits should have mcpUsage field
      // biome-ignore lint/suspicious/noExplicitAny: for a test it's okay..
      for (const limit of limits as any[]) {
        expect(limit.mcpUsage).toBeDefined();
        expect(typeof limit.mcpUsage).toBe("number");
      }
    } finally {
      await makeApiRequest({
        request,
        method: "delete",
        urlSuffix: `/api/mcp-rate-limits/${limit1.id}`,
      });
      await makeApiRequest({
        request,
        method: "delete",
        urlSuffix: `/api/mcp-rate-limits/${limit2.id}`,
      });
    }
  });

  test("updates a limit via PATCH", async ({ request }) => {
    const createResp = await makeApiRequest({
      request,
      method: "post",
      urlSuffix: "/api/mcp-rate-limits",
      data: {
        agentId: profileId,
        limitType: "mcp_server_calls",
        maxCalls: 100,
        mcpServerName: "update-server",
        windowSeconds: 3600,
      },
    });
    const limit = await createResp.json();

    try {
      const updateResp = await makeApiRequest({
        request,
        method: "patch",
        urlSuffix: `/api/mcp-rate-limits/${limit.id}`,
        data: { maxCalls: 200, windowSeconds: 86400 },
      });
      expect(updateResp.status()).toBe(200);
      const updated = await updateResp.json();
      expect(updated.maxCalls).toBe(200);
      expect(updated.windowSeconds).toBe(86400);
    } finally {
      await makeApiRequest({
        request,
        method: "delete",
        urlSuffix: `/api/mcp-rate-limits/${limit.id}`,
      });
    }
  });

  test("deletes a limit and GET returns 404", async ({ request }) => {
    const createResp = await makeApiRequest({
      request,
      method: "post",
      urlSuffix: "/api/mcp-rate-limits",
      data: {
        agentId: profileId,
        limitType: "mcp_server_calls",
        maxCalls: 100,
        mcpServerName: "delete-server",
        windowSeconds: 3600,
      },
    });
    const limit = await createResp.json();

    const deleteResp = await makeApiRequest({
      request,
      method: "delete",
      urlSuffix: `/api/mcp-rate-limits/${limit.id}`,
    });
    expect(deleteResp.status()).toBe(200);

    const getResp = await makeApiRequest({
      request,
      method: "get",
      urlSuffix: `/api/mcp-rate-limits/${limit.id}`,
      ignoreStatusCheck: true,
    });
    expect(getResp.status()).toBe(404);
  });

  test("rejects tool_calls without toolName", async ({ request }) => {
    const response = await makeApiRequest({
      request,
      method: "post",
      urlSuffix: "/api/mcp-rate-limits",
      data: {
        agentId: profileId,
        limitType: "tool_calls",
        maxCalls: 50,
        mcpServerName: "test-server",
        windowSeconds: 60,
        // Missing toolName
      },
      ignoreStatusCheck: true,
    });
    expect(response.status()).toBe(400);
  });
});
